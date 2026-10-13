import type { GroupMembership, Prisma, Transaction } from '@prisma/client';
import { lockGroup, prisma, type Tx } from '../db/prisma';
import { badRequest, conflict, forbidden, notFound } from '../errors/AppError';
import { toAgorot, toShekels } from '../utils/money';
import type {
  BulkTransactionInput,
  CreateTransactionInput,
  ListTransactionsQuery,
  UpdateTransactionInput,
} from '../validation/transaction.schemas';
import { getFundBalance, getTotalDeposited } from './fund.service';

type TransactionWithUsers = Transaction & {
  user: { name: string };
  createdBy: { name: string };
};

const withUsers = {
  user: { select: { name: true } },
  createdBy: { select: { name: true } },
} satisfies Prisma.TransactionInclude;

/**
 * What a client receives for one transaction.
 * A manager, and the owner of the transaction, get the names.
 * A regular member gets other members' transactions without any identifying field.
 */
function toDto(tx: TransactionWithUsers, viewer: GroupMembership) {
  const isMine = tx.userId === viewer.userId;
  const canSeeIdentity = viewer.role === 'manager' || isMine;
  return {
    id: tx.id,
    type: tx.type,
    amount: toShekels(tx.amount),
    isShared: tx.isShared,
    category: tx.category,
    note: tx.note,
    fundBalanceAfter: toShekels(tx.fundBalanceAfter),
    createdAt: tx.createdAt,
    isMine,
    userId: canSeeIdentity ? tx.userId : null,
    userName: canSeeIdentity ? tx.user.name : null,
    recordedByName: canSeeIdentity ? tx.createdBy.name : null,
  };
}

/** Must run right after lockGroup: a closed group accepts no new transactions. */
async function assertGroupOpen(tx: Tx, groupId: number): Promise<void> {
  const group = await tx.group.findUniqueOrThrow({ where: { id: groupId } });
  if (!group.isActive) throw conflict('GROUP_CLOSED', 'הקבוצה סגורה ואי אפשר לבצע בה פעולות');
}

/**
 * A member records a deposit or a withdraw on their own name.
 * The balances and the transaction row are written in ONE database transaction:
 * either everything is saved, or nothing is.
 */
export async function createOwnTransaction(viewer: GroupMembership, input: CreateTransactionInput) {
  const { groupId, userId } = viewer;
  const amount = toAgorot(input.amount);

  const created = await prisma.$transaction(async (tx) => {
    await lockGroup(tx, groupId);
    await assertGroupOpen(tx, groupId);

    if (input.type === 'deposit') {
      await changeBalance(tx, groupId, userId, amount);
    } else if (!input.isShared) {
      await changeBalance(tx, groupId, userId, -amount);
    } else {
      await splitSharedWithdraw(tx, groupId, userId, amount);
    }

    return tx.transaction.create({
      data: {
        groupId,
        userId,
        createdById: userId,
        amount,
        type: input.type,
        isShared: input.isShared,
        category: input.category,
        note: input.note,
        fundBalanceAfter: await getFundBalance(tx, groupId),
      },
      include: withUsers,
    });
  });

  return toDto(created, viewer);
}

async function changeBalance(tx: Tx, groupId: number, userId: number, delta: number) {
  await tx.groupMembership.update({
    where: { userId_groupId: { userId, groupId } },
    data: { balance: { increment: delta } },
  });
}

/**
 * A group expense: every active member pays an equal share.
 * When the amount does not divide evenly, the leftover agorot go to the member who withdrew.
 */
async function splitSharedWithdraw(tx: Tx, groupId: number, withdrawerId: number, amount: number) {
  const membersCount = await tx.groupMembership.count({ where: { groupId, isActive: true } });
  const share = Math.floor(amount / membersCount);
  const leftover = amount - share * membersCount;

  if (share > 0) {
    await tx.groupMembership.updateMany({
      where: { groupId, isActive: true },
      data: { balance: { decrement: share } },
    });
  }
  if (leftover > 0) {
    await changeBalance(tx, groupId, withdrawerId, -leftover);
  }
}

/**
 * The manager records a deposit or a withdraw for several members at once,
 * each with its own amount. One transaction row is created per member.
 */
export async function createBulkTransactions(viewer: GroupMembership, input: BulkTransactionInput) {
  const { groupId } = viewer;

  const created = await prisma.$transaction(async (tx) => {
    await lockGroup(tx, groupId);
    await assertGroupOpen(tx, groupId);

    const userIds = input.items.map((item) => item.userId);
    const activeCount = await tx.groupMembership.count({
      where: { groupId, isActive: true, userId: { in: userIds } },
    });
    if (activeCount !== userIds.length) {
      throw badRequest('MEMBER_NOT_FOUND', 'אחד או יותר מהחברים אינו חבר פעיל בקבוצה');
    }

    let fundBalance = await getFundBalance(tx, groupId);
    const rows: TransactionWithUsers[] = [];

    for (const item of input.items) {
      const amount = toAgorot(item.amount);
      const delta = input.type === 'deposit' ? amount : -amount;
      await changeBalance(tx, groupId, item.userId, delta);
      fundBalance += delta;

      rows.push(
        await tx.transaction.create({
          data: {
            groupId,
            userId: item.userId,
            createdById: viewer.userId,
            amount,
            type: input.type,
            isShared: false,
            category: input.category,
            note: input.note,
            fundBalanceAfter: fundBalance,
          },
          include: withUsers,
        }),
      );
    }
    return rows;
  });

  return created.map((row) => toDto(row, viewer));
}

/** The history of the fund, with search, filters, sorting and paging. */
export async function listTransactions(viewer: GroupMembership, query: ListTransactionsQuery) {
  const { groupId } = viewer;
  const isManager = viewer.role === 'manager';

  if (query.userId !== undefined && !isManager && query.userId !== viewer.userId) {
    throw forbidden('MANAGER_ONLY', 'רק מנהל יכול לסנן לפי חבר אחר');
  }

  const where: Prisma.TransactionWhereInput = { groupId };
  if (query.type) where.type = query.type;
  if (query.category) where.category = query.category;
  if (query.mine) where.userId = viewer.userId;
  else if (query.userId !== undefined) where.userId = query.userId;

  if (query.from || query.to) {
    where.createdAt = { gte: query.from, lte: query.to };
  }

  if (query.search) {
    const inNote: Prisma.TransactionWhereInput = {
      note: { contains: query.search, mode: 'insensitive' },
    };
    // Searching by member name would reveal who made a transaction, so only a manager may do it.
    where.OR = isManager
      ? [inNote, { user: { name: { contains: query.search, mode: 'insensitive' } } }]
      : [inNote];
  }

  const [rows, total, fundBalance, totalDeposited] = await Promise.all([
    prisma.transaction.findMany({
      where,
      include: withUsers,
      orderBy: [
        { createdAt: query.sort === 'newest' ? 'desc' : 'asc' },
        { id: query.sort === 'newest' ? 'desc' : 'asc' },
      ],
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    prisma.transaction.count({ where }),
    getFundBalance(prisma, groupId),
    getTotalDeposited(prisma, groupId),
  ]);

  return {
    summary: {
      totalDeposited: toShekels(totalDeposited),
      fundBalance: toShekels(fundBalance),
    },
    page: query.page,
    pageSize: query.pageSize,
    total,
    items: rows.map((row) => toDto(row, viewer)),
  };
}

/**
 * Only the category and the note can be edited. The amount and the type are never changed -
 * a mistake is fixed by recording an opposite transaction.
 */
export async function updateTransaction(
  viewer: GroupMembership,
  transactionId: number,
  input: UpdateTransactionInput,
) {
  const existing = await prisma.transaction.findFirst({
    where: { id: transactionId, groupId: viewer.groupId },
  });
  if (!existing) throw notFound('TRANSACTION_NOT_FOUND', 'התנועה לא נמצאה');

  if (viewer.role !== 'manager' && existing.userId !== viewer.userId) {
    throw forbidden('NOT_YOUR_TRANSACTION', 'אפשר לערוך רק תנועות שלך');
  }

  const updated = await prisma.transaction.update({
    where: { id: transactionId },
    data: { category: input.category, note: input.note },
    include: withUsers,
  });
  return toDto(updated, viewer);
}
