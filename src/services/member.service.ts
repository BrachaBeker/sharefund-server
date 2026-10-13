import type { GroupMembership, Prisma } from '@prisma/client';
import { lockGroup, prisma } from '../db/prisma';
import { badRequest, conflict, notFound } from '../errors/AppError';
import { toShekels } from '../utils/money';
import { hashPassword } from '../utils/password';
import type { ListMembersQuery, NewMemberInput } from '../validation/group.schemas';
import { assertCanDeactivate, findOrCreateUser } from './group.service';

const BALANCE_FILTERS: Record<NonNullable<ListMembersQuery['balanceStatus']>, Prisma.IntFilter> = {
  debt: { lt: 0 },
  zero: { equals: 0 },
  credit: { gt: 0 },
};

/**
 * The members of the group. A manager gets email and balance and can filter by balance;
 * a regular member gets names and roles only - the sensitive fields never leave the server.
 */
export async function listMembers(membership: GroupMembership, query: ListMembersQuery) {
  const isManager = membership.role === 'manager';

  const where: Prisma.GroupMembershipWhereInput = {
    groupId: membership.groupId,
    isActive: true,
  };
  if (query.search) {
    where.user = isManager
      ? {
          OR: [
            { name: { contains: query.search, mode: 'insensitive' } },
            { email: { contains: query.search, mode: 'insensitive' } },
          ],
        }
      : { name: { contains: query.search, mode: 'insensitive' } };
  }
  if (isManager && query.balanceStatus) {
    where.balance = BALANCE_FILTERS[query.balanceStatus];
  }

  const rows = await prisma.groupMembership.findMany({
    where,
    include: { user: { select: { id: true, name: true, email: true } } },
    orderBy: [{ role: 'asc' }, { user: { name: 'asc' } }],
  });

  if (isManager) {
    return rows.map((m) => ({
      userId: m.user.id,
      name: m.user.name,
      email: m.user.email,
      role: m.role,
      balance: toShekels(m.balance),
      joinedAt: m.joinedAt,
    }));
  }
  return rows.map((m) => ({ name: m.user.name, role: m.role }));
}

/** Adds a member to an existing group. A member that was removed before is re-activated. */
export async function addMember(groupId: number, person: NewMemberInput) {
  const passwordHash = await hashPassword(person.password);

  return prisma.$transaction(async (tx) => {
    await lockGroup(tx, groupId);
    const attached = await findOrCreateUser(tx, person, passwordHash);

    const existing = await tx.groupMembership.findUnique({
      where: { userId_groupId: { userId: attached.userId, groupId } },
    });
    if (existing?.isActive) {
      throw conflict('ALREADY_MEMBER', 'המשתמש כבר חבר בקבוצה');
    }
    if (existing) {
      await tx.groupMembership.update({ where: { id: existing.id }, data: { isActive: true } });
    } else {
      await tx.groupMembership.create({
        data: { groupId, userId: attached.userId, role: 'member' },
      });
    }

    return { ...attached, role: 'member' as const, balance: 0 };
  });
}

async function getActiveMember(groupId: number, userId: number): Promise<GroupMembership> {
  const membership = await prisma.groupMembership.findUnique({
    where: { userId_groupId: { userId, groupId } },
  });
  if (!membership || !membership.isActive) {
    throw notFound('MEMBER_NOT_FOUND', 'החבר לא נמצא בקבוצה');
  }
  return membership;
}

/** Soft delete: the membership becomes inactive, the member's transactions stay in the history. */
export async function removeMember(groupId: number, targetUserId: number) {
  await prisma.$transaction(async (tx) => {
    await lockGroup(tx, groupId);
    const target = await tx.groupMembership.findUnique({
      where: { userId_groupId: { userId: targetUserId, groupId } },
    });
    if (!target || !target.isActive) {
      throw notFound('MEMBER_NOT_FOUND', 'החבר לא נמצא בקבוצה');
    }
    if (target.role === 'manager') {
      throw badRequest('CANNOT_REMOVE_MANAGER', 'אי אפשר להסיר את מנהל הקבוצה');
    }
    await assertCanDeactivate(tx, target);

    await tx.groupMembership.update({ where: { id: target.id }, data: { isActive: false } });
  });
}

/** The manager gives a member a new temporary password; the member must replace it on next login. */
export async function resetMemberPassword(
  groupId: number,
  managerId: number,
  targetUserId: number,
  newPassword: string,
) {
  if (targetUserId === managerId) {
    throw badRequest('USE_CHANGE_PASSWORD', 'כדי לשנות את הסיסמה שלך יש להשתמש בשינוי סיסמה');
  }
  await getActiveMember(groupId, targetUserId);

  await prisma.user.update({
    where: { id: targetUserId },
    data: { passwordHash: await hashPassword(newPassword), mustChangePassword: true },
  });
}
