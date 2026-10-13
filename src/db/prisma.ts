import { Prisma, PrismaClient } from '@prisma/client';

export const prisma = new PrismaClient();

// The client that is available inside prisma.$transaction(async (tx) => ...)
export type Tx = Prisma.TransactionClient;

/**
 * Locks the group row until the surrounding transaction ends.
 * Every action that changes balances or members of a group takes this lock first,
 * so two requests on the same group can never run at the same time.
 */
export async function lockGroup(tx: Tx, groupId: number): Promise<void> {
  await tx.$queryRaw`SELECT id FROM "groups" WHERE id = ${groupId} FOR UPDATE`;
}
