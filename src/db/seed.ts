import type { GroupMembership } from '@prisma/client';
import * as groupService from '../services/group.service';
import * as messageService from '../services/message.service';
import * as transactionService from '../services/transaction.service';
import type {
  BulkTransactionInput,
  CreateTransactionInput,
} from '../validation/transaction.schemas';
import { prisma } from './prisma';

// Demo accounts. They are public on purpose: the login page shows them as quick-login buttons
// and the README lists them, so the site can be tried without creating a group.
const PEOPLE = {
  manager: { name: 'מנהל דמו', email: '123@gmail.com', password: '123123' },
  member1: { name: 'חבר דמו 1', email: '111@gmail.com', password: '111111' },
  member2: { name: 'חבר דמו 2', email: '222@gmail.com', password: '222222' },
  member3: { name: 'חבר דמו 3', email: '333@gmail.com', password: '333333' },
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
 * Creates the demo users, two groups, transactions and messages.
 * Safe to run more than once: it does nothing when the demo data already exists.
 */
export async function seedDemoData(): Promise<void> {
  const alreadySeeded = await prisma.user.findUnique({
    where: { email: PEOPLE.manager.email },
  });
  if (alreadySeeded) {
    console.log('Seed skipped: demo data already exists.');
    return;
  }

  // Group 1: the demo manager opens it as a guest, so the manager user is created too.
  const first = await groupService.createGroup(null, {
    groupName: 'קופת ועד הכיתה',
    manager: PEOPLE.manager,
    members: [PEOPLE.member1, PEOPLE.member2, PEOPLE.member3],
  });
  const classGroup = first.group.id;

  // Members that a manager adds get a temporary password. The demo users can log in right away.
  await prisma.user.updateMany({
    where: { email: { in: Object.values(PEOPLE).map((p) => p.email) } },
    data: { mustChangePassword: false },
  });

  // Group 2: member 1 is the manager here, so the same user has a different role in each group.
  // Member 2 stays in one group only, and goes straight to the dashboard after login.
  const member1 = await prisma.user.findUniqueOrThrow({
    where: { email: PEOPLE.member1.email },
    select: { id: true, name: true, email: true, mustChangePassword: true },
  });
  const second = await groupService.createGroup(member1, {
    groupName: 'טיול משפחתי',
    members: [PEOPLE.manager, PEOPLE.member3],
  });
  const tripGroup = second.group.id;

  // --- Group 1: a healthy fund ---
  await bulk(
    classGroup,
    'manager',
    {
      type: 'deposit',
      category: 'meeting',
      note: 'גבייה למסיבת סוף שנה',
      items: [
        { userId: await userIdOf('manager'), amount: 100 },
        { userId: await userIdOf('member1'), amount: 100 },
        { userId: await userIdOf('member2'), amount: 100 },
      ],
    },
    21,
  );
  await own(
    classGroup,
    'manager',
    {
      type: 'withdraw',
      amount: 120,
      isShared: true,
      category: 'meeting',
      note: 'השכרת אולם למסיבה',
    },
    14,
  );
  await own(
    classGroup,
    'member3',
    {
      type: 'deposit',
      amount: 50,
      isShared: false,
      category: 'general',
      note: 'תשלום חלקי',
    },
    10,
  );
  await own(
    classGroup,
    'member1',
    {
      type: 'withdraw',
      amount: 45.5,
      isShared: true,
      category: 'equipment',
      note: 'קניית כדורים וציוד',
    },
    6,
  );
  await own(
    classGroup,
    'member2',
    {
      type: 'withdraw',
      amount: 20,
      isShared: false,
      category: 'other',
      note: 'החזר אישי',
    },
    2,
  );

  // --- Group 2: more was spent than deposited, so the fund is negative ---
  await bulk(
    tripGroup,
    'member1',
    {
      type: 'deposit',
      category: 'general',
      note: 'מקדמה לטיול',
      items: [
        { userId: await userIdOf('member1'), amount: 100 },
        { userId: await userIdOf('manager'), amount: 100 },
      ],
    },
    9,
  );
  await own(
    tripGroup,
    'member1',
    {
      type: 'withdraw',
      amount: 260,
      isShared: true,
      category: 'meeting',
      note: 'הזמנת צימר',
    },
    4,
  );

  // --- Messages ---
  await messageService.sendMessage(await membershipOf(classGroup, 'manager'), {
    content: 'שלום לכולם! אוספים 100 ש"ח למסיבת סוף השנה.',
    toAll: true,
  });
  await messageService.sendMessage(await membershipOf(classGroup, 'manager'), {
    content: 'חבר דמו 3, נשארה לך יתרת חוב קטנה. אפשר להסדיר עד סוף השבוע?',
    recipientIds: [await userIdOf('member3')],
  });
  await messageService.sendMessage(await membershipOf(classGroup, 'member3'), {
    content: 'הבנתי, אעביר מחר.',
  });
  await messageService.sendMessage(await membershipOf(tripGroup, 'member1'), {
    content: 'הצימר הוזמן. הקופה במינוס, נא להפקיד את החלק שלכם.',
    toAll: true,
  });

  console.log('Seed done: 4 demo users, 2 groups, transactions and messages were created.');
}
