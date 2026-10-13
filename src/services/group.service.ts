import type { Group, GroupMembership } from '@prisma/client';
import { lockGroup, prisma, type Tx } from '../db/prisma';
import { badRequest, conflict, forbidden } from '../errors/AppError';
import type { AuthUser } from '../middleware/context';
import { signAccessToken } from '../utils/jwt';
import { toShekels } from '../utils/money';
import { hashPassword } from '../utils/password';
import type { CreateGroupInput, NewMemberInput } from '../validation/group.schemas';
import {
  MIN_MEMBERS,
  countActiveMembers,
  getFundBalance,
  getTotalDeposited,
} from './fund.service';

export interface AttachResult {
  userId: number;
  name: string;
  email: string;
  /** false = the email already belonged to a user, so the given name and password were ignored */
  isNewUser: boolean;
}

/**
 * Finds the user by email, or creates a new one with a temporary password.
 * An existing user is only attached - their name and password are never changed.
 */
export async function findOrCreateUser(
  tx: Tx,
  person: NewMemberInput,
  passwordHash: string,
): Promise<AttachResult> {
  const existing = await tx.user.findUnique({ where: { email: person.email } });
  if (existing) {
    return { userId: existing.id, name: existing.name, email: existing.email, isNewUser: false };
  }
  const created = await tx.user.create({
    data: { name: person.name, email: person.email, passwordHash, mustChangePassword: true },
  });
  return { userId: created.id, name: created.name, email: created.email, isNewUser: true };
}

/**
 * Creates a group. A logged-in user becomes its manager; a guest must send manager details,
 * and a new user is created for them (in that case a login token is returned as well).
 */
export async function createGroup(actor: AuthUser | null, input: CreateGroupInput) {
  if (actor) {
    if (input.members.some((m) => m.email === actor.email)) {
      throw badRequest('MANAGER_IN_MEMBERS', 'מייל המנהל לא יכול להופיע ברשימת החברים');
    }
  } else {
    if (!input.manager) {
      throw badRequest('MANAGER_REQUIRED', 'יש למלא את פרטי המנהל, או להתחבר לפני יצירת הקבוצה');
    }
    const taken = await prisma.user.findUnique({ where: { email: input.manager.email } });
    if (taken) {
      throw conflict('EMAIL_EXISTS_LOGIN_REQUIRED', 'המייל כבר רשום במערכת. יש להתחבר ואז ליצור את הקבוצה');
    }
  }

  // Hashing is slow, so it is done before the database transaction starts.
  const managerHash = !actor && input.manager ? await hashPassword(input.manager.password) : null;
  const memberHashes = await Promise.all(input.members.map((m) => hashPassword(m.password)));

  const result = await prisma.$transaction(async (tx) => {
    let managerId: number;
    if (actor) {
      managerId = actor.id;
    } else {
      const manager = input.manager as NewMemberInput;
      const created = await tx.user.create({
        data: {
          name: manager.name,
          email: manager.email,
          passwordHash: managerHash as string,
          mustChangePassword: false,
        },
      });
      managerId = created.id;
    }

    const group = await tx.group.create({ data: { name: input.groupName, createdById: managerId } });
    await tx.groupMembership.create({
      data: { groupId: group.id, userId: managerId, role: 'manager' },
    });

    const members: AttachResult[] = [];
    for (const [index, person] of input.members.entries()) {
      const attached = await findOrCreateUser(tx, person, memberHashes[index] as string);
      await tx.groupMembership.create({
        data: { groupId: group.id, userId: attached.userId, role: 'member' },
      });
      members.push(attached);
    }

    return { group, managerId, members };
  });

  return {
    group: toGroupDto(result.group),
    members: result.members,
    // a guest who just registered is logged in right away
    token: actor ? undefined : signAccessToken(result.managerId),
  };
}

function toGroupDto(group: Group) {
  return {
    id: group.id,
    name: group.name,
    isActive: group.isActive,
    createdAt: group.createdAt,
    closedAt: group.closedAt,
  };
}

/** All the groups the user is an active member of, with the user's role and balance in each. */
export async function listMyGroups(userId: number) {
  const memberships = await prisma.groupMembership.findMany({
    where: { userId, isActive: true },
    include: { group: true },
    orderBy: { group: { createdAt: 'desc' } },
  });
  return memberships.map((m) => ({
    ...toGroupDto(m.group),
    role: m.role,
    myBalance: toShekels(m.balance),
  }));
}

/** The data of the personal area: the fund, my balance and my role. */
export async function getDashboard(group: Group, membership: GroupMembership) {
  const [fundBalance, totalDeposited, membersCount, manager] = await Promise.all([
    getFundBalance(prisma, group.id),
    getTotalDeposited(prisma, group.id),
    countActiveMembers(prisma, group.id),
    prisma.user.findUniqueOrThrow({ where: { id: group.createdById }, select: { name: true } }),
  ]);
  return {
    ...toGroupDto(group),
    managerName: manager.name,
    membersCount,
    role: membership.role,
    myBalance: toShekels(membership.balance),
    fundBalance: toShekels(fundBalance),
    totalDeposited: toShekels(totalDeposited),
  };
}

/**
 * Closes the group. When some balances are not 0 the manager must confirm with force=true;
 * otherwise the answer is 409 with the list of members that still owe or are owed money.
 */
export async function closeGroup(groupId: number, force: boolean) {
  return prisma.$transaction(async (tx) => {
    await lockGroup(tx, groupId);
    const group = await tx.group.findUniqueOrThrow({ where: { id: groupId } });
    if (!group.isActive) throw conflict('GROUP_CLOSED', 'הקבוצה כבר סגורה');

    const nonZero = await tx.groupMembership.findMany({
      where: { groupId, balance: { not: 0 } },
      include: { user: { select: { name: true } } },
      orderBy: { balance: 'asc' },
    });

    if (nonZero.length > 0 && !force) {
      throw conflict('BALANCES_NOT_ZERO', 'יש חברים שהיתרה שלהם אינה 0. לסגור בכל זאת?', {
        fundBalance: toShekels(await getFundBalance(tx, groupId)),
        members: nonZero.map((m) => ({
          userId: m.userId,
          name: m.user.name,
          balance: toShekels(m.balance),
        })),
      });
    }

    const closed = await tx.group.update({
      where: { id: groupId },
      data: { isActive: false, closedAt: new Date() },
    });
    return toGroupDto(closed);
  });
}

/** A regular member leaves the group. Allowed only with balance 0 and when 3 members remain. */
export async function leaveGroup(groupId: number, userId: number) {
  await prisma.$transaction(async (tx) => {
    await lockGroup(tx, groupId);
    const membership = await tx.groupMembership.findUniqueOrThrow({
      where: { userId_groupId: { userId, groupId } },
    });

    if (membership.role === 'manager') {
      throw forbidden('MANAGER_CANNOT_LEAVE', 'מנהל לא יכול לצאת מהקבוצה, רק לסגור אותה');
    }
    await assertCanDeactivate(tx, membership);

    await tx.groupMembership.update({ where: { id: membership.id }, data: { isActive: false } });
  });
}

/** The rules shared by "leave group" and "remove member". Must run inside the group lock. */
export async function assertCanDeactivate(tx: Tx, membership: GroupMembership): Promise<void> {
  if (membership.balance !== 0) {
    throw conflict('BALANCE_NOT_ZERO', 'יציאה או הסרה מהקבוצה אפשריות רק כשיתרת החבר היא 0', {
      balance: toShekels(membership.balance),
    });
  }
  if ((await countActiveMembers(tx, membership.groupId)) <= MIN_MEMBERS) {
    throw conflict('MIN_MEMBERS', `בקבוצה חייבים להישאר לפחות ${MIN_MEMBERS} חברים`);
  }
}
