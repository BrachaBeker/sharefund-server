import request from 'supertest';
import { createApp } from '../src/app';
import { prisma } from '../src/db/prisma';

export const app = createApp();
export const api = () => request(app);
export const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

/** The temporary password a manager gives, and the password everyone uses after replacing it. */
export const TEMP_PASSWORD = 'Temp1234';
export const PASSWORD = 'Secret123';

export async function resetDb(): Promise<void> {
  await prisma.$executeRawUnsafe(
    'TRUNCATE TABLE "message_recipients", "messages", "transactions", "group_memberships", "groups", "users" RESTART IDENTITY CASCADE',
  );
}

export interface Person {
  id: number;
  name: string;
  email: string;
  token: string;
}

export async function loginAs(email: string, password: string): Promise<string> {
  const res = await api().post('/api/auth/login').send({ email, password });
  if (res.status !== 200) throw new Error(`login failed for ${email}: ${res.status}`);
  return res.body.token as string;
}

/** Logs in with the temporary password and replaces it, like a member does on first login. */
export async function activate(email: string): Promise<string> {
  const token = await loginAs(email, TEMP_PASSWORD);
  const res = await api()
    .post('/api/auth/change-password')
    .set(bearer(token))
    .send({ currentPassword: TEMP_PASSWORD, newPassword: PASSWORD });
  if (res.status !== 200) throw new Error(`activate failed for ${email}: ${res.status}`);
  return token;
}

export interface Scenario {
  groupId: number;
  manager: Person;
  members: Person[];
}

/**
 * A guest creates a group: one manager and `memberCount` regular members.
 * All the members already replaced their temporary password.
 * `prefix` keeps the emails of two scenarios in the same test apart.
 */
export async function createScenario(memberCount = 3, prefix = ''): Promise<Scenario> {
  const managerEmail = `${prefix}manager@test.com`;
  const memberInputs = Array.from({ length: memberCount }, (_, i) => ({
    name: `Member ${i + 1}`,
    email: `${prefix}m${i + 1}@test.com`,
    password: TEMP_PASSWORD,
  }));

  const res = await api()
    .post('/api/groups')
    .send({
      groupName: `${prefix}Test group`,
      manager: { name: 'The Manager', email: managerEmail, password: PASSWORD },
      members: memberInputs,
    });
  if (res.status !== 201) throw new Error(`createScenario failed: ${JSON.stringify(res.body)}`);

  const managerToken = res.body.token as string;
  const me = await api().get('/api/auth/me').set(bearer(managerToken));

  const members: Person[] = [];
  for (const created of res.body.members as { userId: number; name: string; email: string }[]) {
    members.push({
      id: created.userId,
      name: created.name,
      email: created.email,
      token: await activate(created.email),
    });
  }

  return {
    groupId: res.body.group.id as number,
    manager: {
      id: me.body.user.id as number,
      name: 'The Manager',
      email: managerEmail,
      token: managerToken,
    },
    members,
  };
}

export function postTransaction(token: string, groupId: number, body: Record<string, unknown>) {
  return api().post(`/api/groups/${groupId}/transactions`).set(bearer(token)).send(body);
}

/** Balances of all the members as the manager sees them: { userId: balance } */
export async function balances(managerToken: string, groupId: number): Promise<Record<number, number>> {
  const res = await api().get(`/api/groups/${groupId}/members`).set(bearer(managerToken));
  const result: Record<number, number> = {};
  for (const m of res.body.members as { userId: number; balance: number }[]) {
    result[m.userId] = m.balance;
  }
  return result;
}

export async function fundBalance(token: string, groupId: number): Promise<number> {
  const res = await api().get(`/api/groups/${groupId}`).set(bearer(token));
  return res.body.group.fundBalance as number;
}

/** Fails with a clear message when a fixture has fewer people than the test expects. */
export function at<T>(list: T[], index: number): T {
  const item = list[index];
  if (item === undefined) throw new Error(`no item at index ${index}`);
  return item;
}
