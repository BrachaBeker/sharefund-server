import type { GroupMembership } from '@prisma/client';
import { env } from '../config/env';
import * as groupService from '../services/group.service';
import * as messageService from '../services/message.service';
import * as transactionService from '../services/transaction.service';
import type {
  BulkTransactionInput,
  CreateTransactionInput,
} from '../validation/transaction.schemas';
import { prisma } from './prisma';

// Demo accounts. No password is written in the code:
// it always comes from the SEED_DEMO_PASSWORD environment variable.
const PEOPLE = {
  dana: { name: 'דנה לוי', email: 'dana@example.com' },
  yossi: { name: 'יוסי כהן', email: 'yossi@example.com' },
  michal: { name: 'מיכל אברהם', email: 'michal@example.com' },
  avi: { name: 'אבי מזרחי', email: 'avi@example.com' },
  noa: { name: 'נועה פרץ', email: 'noa@example.com' },
} as const;

type PersonKey = keyof typeof PEOPLE;

async function membershipOf(groupId: number, key: PersonKey): Promise<GroupMembership> {
  const user = await prisma.user.findUniqueOrThrow({ where: { email: PEOPLE[key].email } });
  return prisma.groupMembership.findUniqueOrThrow({
    where: { userId_groupId: { userId: user.id, groupId } },
  });
}

async function userIdOf(key: PersonKey): Promise<number> {
  const user = await prisma.user.findUniqueOrThrow({ where: { email: PEOPLE[key].email } });
  return user.id;
}

/** Spreads the demo transactions over the last weeks, so date filters have something to show. */
async function backdate(transactionIds: number[], daysAgo: number): Promise<void> {
  const date = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000);
  await prisma.transaction.updateMany({
    where: { id: { in: transactionIds } },
    data: { createdAt: date },
  });
}

async function own(groupId: number, key: PersonKey, input: CreateTransactionInput, daysAgo: number) {
  const created = await transactionService.createOwnTransaction(
    await membershipOf(groupId, key),
    input,
  );
  await backdate([created.id], daysAgo);
}

async function bulk(groupId: number, key: PersonKey, input: BulkTransactionInput, daysAgo: number) {
  const created = await transactionService.createBulkTransactions(
    await membershipOf(groupId, key),
    input,
  );
  await backdate(
    created.map((t) => t.id),
    daysAgo,
  );
}

/**
 * Creates demo users, two groups, transactions and messages.
 * Safe to run more than once: it does nothing when the demo data already exists.
 */
export async function seedDemoData(): Promise<void> {
  const password = env.seedDemoPassword;
  if (!password || password.length < 6) {
    console.warn('Seed skipped: set SEED_DEMO_PASSWORD (at least 6 characters) to create demo users.');
    return;
  }

  const alreadySeeded = await prisma.user.findUnique({ where: { email: PEOPLE.dana.email } });
  if (alreadySeeded) {
    console.log('Seed skipped: demo data already exists.');
    return;
  }

  const person = (key: PersonKey) => ({ ...PEOPLE[key], password });

  // Group 1: Dana is the manager. Created as a guest, so Dana's user is created too.
  const first = await groupService.createGroup(null, {
    groupName: 'קופת ועד הכיתה',
    manager: person('dana'),
    members: [person('yossi'), person('michal'), person('avi')],
  });
  const classGroup = first.group.id;

  // Group 2: Yossi is the manager and Dana is a regular member -
  // the same user has a different role in each group.
  const yossi = await prisma.user.findUniqueOrThrow({
    where: { email: PEOPLE.yossi.email },
    select: { id: true, name: true, email: true, mustChangePassword: true },
  });
  const second = await groupService.createGroup(
    { ...yossi, mustChangePassword: false },
    { groupName: 'חוג ריצה שכונתי', members: [person('dana'), person('noa')] },
  );
  const runGroup = second.group.id;

  // Members that a manager adds get a temporary password. For the demo everyone can log in
  // right away, except Noa - she demonstrates the forced password change on first login.
  await prisma.user.updateMany({
    where: { email: { in: Object.values(PEOPLE).map((p) => p.email) } },
    data: { mustChangePassword: false },
  });
  await prisma.user.update({
    where: { email: PEOPLE.noa.email },
    data: { mustChangePassword: true },
  });

  // --- Group 1 transactions ---
  await bulk(
    classGroup,
    'dana',
    {
      type: 'deposit',
      category: 'meeting',
      note: 'גבייה למסיבת סוף שנה',
      items: [
        { userId: await userIdOf('dana'), amount: 50 },
        { userId: await userIdOf('yossi'), amount: 50 },
        { userId: await userIdOf('michal'), amount: 30 },
      ],
    },
    21,
  );
  await own(
    classGroup,
    'dana',
    { type: 'withdraw', amount: 120, isShared: true, category: 'meeting', note: 'השכרת אולם למסיבה' },
    14,
  );
  await own(
    classGroup,
    'avi',
    { type: 'deposit', amount: 30, isShared: false, category: 'general', note: 'תשלום חלקי' },
    10,
  );
  await own(
    classGroup,
    'yossi',
    { type: 'withdraw', amount: 45.5, isShared: true, category: 'equipment', note: 'קניית כדורים וציוד' },
    6,
  );
  await own(
    classGroup,
    'michal',
    { type: 'deposit', amount: 20, isShared: false, category: 'other', note: 'השלמת חוב' },
    2,
  );

  // --- Group 2 transactions ---
  await bulk(
    runGroup,
    'yossi',
    {
      type: 'deposit',
      category: 'equipment',
      note: 'גבייה לחולצות ריצה',
      items: [
        { userId: await userIdOf('yossi'), amount: 80 },
        { userId: await userIdOf('dana'), amount: 80 },
      ],
    },
    9,
  );
  await own(
    runGroup,
    'yossi',
    { type: 'withdraw', amount: 150, isShared: true, category: 'equipment', note: 'הזמנת חולצות' },
    4,
  );

  // --- Messages ---
  await messageService.sendMessage(await membershipOf(classGroup, 'dana'), {
    content: 'שלום לכולם! אוספים 50 ש"ח למסיבת סוף השנה.',
    toAll: true,
  });
  await messageService.sendMessage(await membershipOf(classGroup, 'dana'), {
    content: 'אבי, נשארה לך יתרת חוב קטנה. אפשר להסדיר עד סוף השבוע?',
    recipientIds: [await userIdOf('avi')],
  });
  await messageService.sendMessage(await membershipOf(classGroup, 'avi'), {
    content: 'הבנתי, אעביר מחר.',
  });
  await messageService.sendMessage(await membershipOf(runGroup, 'yossi'), {
    content: 'החולצות הוזמנו. נועה, נא להעביר את החלק שלך.',
    toAll: true,
  });

  console.log('Seed done: 5 demo users, 2 groups, transactions and messages were created.');
}
