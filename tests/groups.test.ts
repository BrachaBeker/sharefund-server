import { beforeEach, describe, expect, it } from 'vitest';
import {
  PASSWORD,
  TEMP_PASSWORD,
  api,
  at,
  bearer,
  createScenario,
  loginAs,
  postTransaction,
  resetDb,
} from './helpers';

beforeEach(resetDb);

const person = (name: string, email: string) => ({ name, email, password: TEMP_PASSWORD });

describe('create group', () => {
  it('lets a guest create a group and logs them in', async () => {
    const res = await api()
      .post('/api/groups')
      .send({
        groupName: 'Family fund',
        manager: { name: 'Guest Manager', email: 'guest@test.com', password: PASSWORD },
        members: [person('Aaa Bbb', 'a@test.com'), person('Ccc Ddd', 'c@test.com')],
      });

    expect(res.status).toBe(201);
    expect(res.body.group.name).toBe('Family fund');
    expect(res.body.token).toEqual(expect.any(String));
    expect(res.body.members).toHaveLength(2);
    expect(res.body.members.every((m: { isNewUser: boolean }) => m.isNewUser)).toBe(true);

    const groups = await api().get('/api/groups').set(bearer(res.body.token));
    expect(groups.body.groups).toHaveLength(1);
    expect(groups.body.groups[0].role).toBe('manager');
  });

  it('requires at least 3 people (the manager and 2 more)', async () => {
    const res = await api()
      .post('/api/groups')
      .send({
        groupName: 'Too small',
        manager: { name: 'Guest Manager', email: 'guest@test.com', password: PASSWORD },
        members: [person('Aaa Bbb', 'a@test.com')],
      });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('rejects the same email twice, and the manager email inside the members', async () => {
    const duplicate = await api()
      .post('/api/groups')
      .send({
        groupName: 'Duplicates',
        manager: { name: 'Guest Manager', email: 'guest@test.com', password: PASSWORD },
        members: [person('Aaa Bbb', 'a@test.com'), person('Aaa Again', 'A@test.com')],
      });
    expect(duplicate.status).toBe(400);

    const managerInside = await api()
      .post('/api/groups')
      .send({
        groupName: 'Manager inside',
        manager: { name: 'Guest Manager', email: 'guest@test.com', password: PASSWORD },
        members: [person('Aaa Bbb', 'a@test.com'), person('Me Again', 'guest@test.com')],
      });
    expect(managerInside.status).toBe(400);
  });

  it('requires manager details from a guest', async () => {
    const res = await api()
      .post('/api/groups')
      .send({
        groupName: 'No manager',
        members: [person('Aaa Bbb', 'a@test.com'), person('Ccc Ddd', 'c@test.com')],
      });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('MANAGER_REQUIRED');
  });

  it('does not let a guest create a group in the name of an existing user', async () => {
    const { manager } = await createScenario();
    const res = await api()
      .post('/api/groups')
      .send({
        groupName: 'Impersonation',
        manager: { name: 'Fake', email: manager.email, password: 'Whatever123' },
        members: [person('Aaa Bbb', 'a@test.com'), person('Ccc Ddd', 'c@test.com')],
      });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('EMAIL_EXISTS_LOGIN_REQUIRED');
    // the real password still works
    await expect(loginAs(manager.email, PASSWORD)).resolves.toEqual(expect.any(String));
  });

  it('makes a logged-in user the manager, and only attaches existing users', async () => {
    const first = await createScenario();
    const existing = at(first.members, 0);

    // a regular member of the first group opens a group of their own
    const res = await api()
      .post('/api/groups')
      .set(bearer(at(first.members, 1).token))
      .send({
        groupName: 'Second group',
        members: [
          { name: 'Ignored Name', email: existing.email, password: 'IgnoredPass1' },
          person('Brand New', 'brandnew@test.com'),
        ],
      });

    expect(res.status).toBe(201);
    expect(res.body.token).toBeUndefined();
    const attached = res.body.members.find((m: { email: string }) => m.email === existing.email);
    expect(attached).toMatchObject({ isNewUser: false, name: existing.name, userId: existing.id });

    // the existing user keeps the old password; the one typed by the new manager is ignored
    await expect(loginAs(existing.email, PASSWORD)).resolves.toEqual(expect.any(String));
    const wrong = await api()
      .post('/api/auth/login')
      .send({ email: existing.email, password: 'IgnoredPass1' });
    expect(wrong.status).toBe(401);

    // the same user now has a different role in each group
    const groups = await api().get('/api/groups').set(bearer(at(first.members, 1).token));
    const roles = groups.body.groups.map((g: { name: string; role: string }) => [g.name, g.role]);
    expect(roles).toContainEqual(['Second group', 'manager']);
    expect(roles).toContainEqual(['Test group', 'member']);
  });
});

describe('group access', () => {
  it('returns the dashboard to a member', async () => {
    const { groupId, members } = await createScenario();
    const res = await api().get(`/api/groups/${groupId}`).set(bearer(at(members, 0).token));
    expect(res.status).toBe(200);
    expect(res.body.group).toMatchObject({
      id: groupId,
      role: 'member',
      membersCount: 4,
      myBalance: 0,
      fundBalance: 0,
      totalDeposited: 0,
      managerName: 'The Manager',
    });
  });

  it('returns 403 to a user that is not a member of the group', async () => {
    const mine = await createScenario(2, 'a-');
    const other = await createScenario(2, 'b-');

    for (const path of ['', '/members', '/transactions', '/messages']) {
      const res = await api()
        .get(`/api/groups/${other.groupId}${path}`)
        .set(bearer(mine.manager.token));
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('NOT_A_MEMBER');
    }
  });

  it('returns 404 for a group that does not exist, and 400 for a bad id', async () => {
    const { manager } = await createScenario();
    const missing = await api().get('/api/groups/9999').set(bearer(manager.token));
    expect(missing.status).toBe(404);
    const bad = await api().get('/api/groups/abc').set(bearer(manager.token));
    expect(bad.status).toBe(400);
  });

  it('returns 401 without a token', async () => {
    const { groupId } = await createScenario();
    const res = await api().get(`/api/groups/${groupId}`);
    expect(res.status).toBe(401);
  });
});

describe('close group', () => {
  it('is allowed to the manager only', async () => {
    const { groupId, members } = await createScenario();
    const res = await api().post(`/api/groups/${groupId}/close`).set(bearer(at(members, 0).token));
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('MANAGER_ONLY');
  });

  it('closes right away when all the balances are 0', async () => {
    const { groupId, manager } = await createScenario();
    const res = await api().post(`/api/groups/${groupId}/close`).set(bearer(manager.token));
    expect(res.status).toBe(200);
    expect(res.body.group.isActive).toBe(false);
    expect(res.body.group.closedAt).toEqual(expect.any(String));
  });

  it('asks for confirmation when balances are not 0, and closes with force', async () => {
    const { groupId, manager, members } = await createScenario();
    const debtor = at(members, 0);
    await postTransaction(debtor.token, groupId, { type: 'withdraw', amount: 30 });

    const refused = await api()
      .post(`/api/groups/${groupId}/close`)
      .set(bearer(manager.token))
      .send({});
    expect(refused.status).toBe(409);
    expect(refused.body.error.code).toBe('BALANCES_NOT_ZERO');
    expect(refused.body.error.details).toEqual({
      fundBalance: -30,
      members: [{ userId: debtor.id, name: debtor.name, balance: -30 }],
    });

    const forced = await api()
      .post(`/api/groups/${groupId}/close`)
      .set(bearer(manager.token))
      .send({ force: true });
    expect(forced.status).toBe(200);
    expect(forced.body.group.isActive).toBe(false);
  });

  it('leaves a closed group readable, and rejects every write', async () => {
    const { groupId, manager, members } = await createScenario();
    const member = at(members, 0);
    await api().post(`/api/groups/${groupId}/close`).set(bearer(manager.token));

    for (const path of ['', '/members', '/transactions', '/messages']) {
      const read = await api().get(`/api/groups/${groupId}${path}`).set(bearer(member.token));
      expect(read.status).toBe(200);
    }
    const list = await api().get('/api/groups').set(bearer(member.token));
    expect(list.body.groups[0].isActive).toBe(false);

    const writes = [
      postTransaction(member.token, groupId, { type: 'deposit', amount: 10 }),
      api()
        .post(`/api/groups/${groupId}/transactions/bulk`)
        .set(bearer(manager.token))
        .send({ type: 'deposit', items: [{ userId: member.id, amount: 10 }] }),
      api().post(`/api/groups/${groupId}/messages`).set(bearer(member.token)).send({ content: 'hi' }),
      api()
        .post(`/api/groups/${groupId}/members`)
        .set(bearer(manager.token))
        .send(person('Late Comer', 'late@test.com')),
      api().delete(`/api/groups/${groupId}/members/${member.id}`).set(bearer(manager.token)),
      api().post(`/api/groups/${groupId}/leave`).set(bearer(member.token)),
      api().post(`/api/groups/${groupId}/close`).set(bearer(manager.token)),
    ];
    for (const res of await Promise.all(writes)) {
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('GROUP_CLOSED');
    }
  });
});

describe('leave group', () => {
  it('lets a member with balance 0 leave, and removes their access', async () => {
    const { groupId, manager, members } = await createScenario(3);
    const leaver = at(members, 0);

    const res = await api().post(`/api/groups/${groupId}/leave`).set(bearer(leaver.token));
    expect(res.status).toBe(204);

    const after = await api().get(`/api/groups/${groupId}`).set(bearer(leaver.token));
    expect(after.status).toBe(403);
    const groups = await api().get('/api/groups').set(bearer(leaver.token));
    expect(groups.body.groups).toHaveLength(0);

    const dashboard = await api().get(`/api/groups/${groupId}`).set(bearer(manager.token));
    expect(dashboard.body.group.membersCount).toBe(3);
  });

  it('does not let the manager leave', async () => {
    const { groupId, manager } = await createScenario(3);
    const res = await api().post(`/api/groups/${groupId}/leave`).set(bearer(manager.token));
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('MANAGER_CANNOT_LEAVE');
  });

  it('does not let a member with a debt or a credit leave', async () => {
    const { groupId, members } = await createScenario(3);
    const member = at(members, 0);
    await postTransaction(member.token, groupId, { type: 'deposit', amount: 20 });

    const res = await api().post(`/api/groups/${groupId}/leave`).set(bearer(member.token));
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('BALANCE_NOT_ZERO');
  });

  it('keeps at least 3 members in the group', async () => {
    const { groupId, members } = await createScenario(2);
    const res = await api().post(`/api/groups/${groupId}/leave`).set(bearer(at(members, 0).token));
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('MIN_MEMBERS');
  });
});
