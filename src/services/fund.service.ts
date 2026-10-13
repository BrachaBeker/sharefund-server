import { prisma, type Tx } from '../db/prisma';

type Db = Tx | typeof prisma;

/** A group must always keep at least this many active members. */
export const MIN_MEMBERS = 3;

/** The fund balance (agorot) = the sum of the balances of all the members of the group. */
export async function getFundBalance(db: Db, groupId: number): Promise<number> {
  const result = await db.groupMembership.aggregate({
    where: { groupId },
    _sum: { balance: true },
  });
  return result._sum.balance ?? 0;
}

/** Everything that was ever deposited into the fund (agorot). */
export async function getTotalDeposited(db: Db, groupId: number): Promise<number> {
  const result = await db.transaction.aggregate({
    where: { groupId, type: 'deposit' },
    _sum: { amount: true },
  });
  return result._sum.amount ?? 0;
}

export function countActiveMembers(db: Db, groupId: number): Promise<number> {
  return db.groupMembership.count({ where: { groupId, isActive: true } });
}
