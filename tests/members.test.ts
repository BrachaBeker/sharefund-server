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

describe('list members', () => {
  it('gives the manager emails and balances', async () => {
    const { groupId, manager, members } = await createScenario();
    await postTransaction(at(members, 0).token, groupId, { type: 'deposit', amount: 25.5 });

    const res = await api().get(`/api/groups/${groupId}/members`).set(bearer(manager.token));

    expect(res.status).toBe(200);
    expect(res.body.members).toHaveLength(4);
    expect(res.body.members[0]).toMatchObject({ role: 'manager', email: manager.email });
    const depositor = res.body.members.find((m: { userId: number }) => m.userId === at(members, 0).id);
    expect(depositor).toMatchObject({ balance: 25.5, email: at(members, 0).email, role: 'member' });
  });

  it('gives a regular member names and roles only', async () => {
    const { groupId, members } = await createScenario();
    await postTransaction(at(members, 0).token, groupId, { type: 'deposit', amount: 25.5 });

    const res = await api().get(`/api/groups/${groupId}/members`).set(bearer(at(members, 1).token));

    expect(res.status).toBe(200);
    expect(res.body.members).toHaveLength(4);
    for (const member of res.body.members as Record<string, unknown>[]) {
      expect(Object.keys(member).sort()).toEqual(['name', 'role']);
    }
    expect(JSON.stringify(res.body)).not.toContain('@test.com');
    expect(JSON.stringify(res.body)).not.toContain('25.5');
  });

  it('searches by name and filters by balance status', async () => {
    const { groupId, manager, members } = await createScenario();
    await postTransaction(at(members, 0).token, groupId, { type: 'deposit', amount: 10 });
    await postTransaction(at(members, 1).token, groupId, { type: 'withdraw', amount: 10 });

    const url = `/api/groups/${groupId}/members`;
    const names = async (query: string) => {
      const res = await api().get(`${url}?${query}`).set(bearer(manager.token));
      return (res.body.members as { name: string }[]).map((m) => m.name);
    };

    expect(await names('search=member 2')).toEqual(['Member 2']);
    expect(await names('search=m3@test')).toEqual(['Member 3']);
    expect(await names('balanceStatus=credit')).toEqual(['Member 1']);
    expect(await names('balanceStatus=debt')).toEqual(['Member 2']);
    expect(await names('balanceStatus=zero')).toEqual(['The Manager', 'Member 3']);

    const bad = await api().get(`${url}?balanceStatus=rich`).set(bearer(manager.token));
    expect(bad.status).toBe(400);
  });

  it('ignores the balance filter for a regular member', async () => {
    const { groupId, members } = await createScenario();
    await postTransaction(at(members, 0).token, groupId, { type: 'deposit', amount: 10 });
    const res = await api()
      .get(`/api/groups/${groupId}/members?balanceStatus=credit`)
      .set(bearer(at(members, 1).token));
    expect(res.body.members).toHaveLength(4);
  });
});

describe('add member', () => {
  const newcomer = { name: 'New Comer', email: 'newcomer@test.com', password: TEMP_PASSWORD };

  it('lets the manager add a member, who starts with balance 0 and a temporary password', async () => {
    const { groupId, manager } = await createScenario();

    const res = await api().post(`/api/groups/${groupId}/members`).set(bearer(manager.token)).send(newcomer);

    expect(res.status).toBe(201);
    expect(res.body.member).toMatchObject({ email: newcomer.email, isNewUser: true, balance: 0 });

    const login = await api()
      .post('/api/auth/login')
      .send({ email: newcomer.email, password: TEMP_PASSWORD });
    expect(login.body.user.mustChangePassword).toBe(true);
  });

  it('is forbidden to a regular member', async () => {
    const { groupId, members } = await createScenario();
    const res = await api()
      .post(`/api/groups/${groupId}/members`)
      .set(bearer(at(members, 0).token))
      .send(newcomer);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('MANAGER_ONLY');
  });

  it('rejects someone who is already a member', async () => {
    const { groupId, manager, members } = await createScenario();
    const res = await api()
      .post(`/api/groups/${groupId}/members`)
      .set(bearer(manager.token))
      .send({ name: 'Again', email: at(members, 0).email, password: TEMP_PASSWORD });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('ALREADY_MEMBER');
  });

  it('validates the input', async () => {
    const { groupId, manager } = await createScenario();
    const res = await api()
      .post(`/api/groups/${groupId}/members`)
      .set(bearer(manager.token))
      .send({ name: 'X', email: 'bad', password: '1' });
    expect(res.status).toBe(400);
    expect(res.body.error.details).toHaveLength(3);
  });
});

describe('remove member', () => {
  it('soft-deletes a member with balance 0, and re-activates them when added again', async () => {
    const { groupId, manager, members } = await createScenario(3);
    const target = at(members, 0);
    await postTransaction(target.token, groupId, { type: 'deposit', amount: 40 });
    await postTransaction(target.token, groupId, { type: 'withdraw', amount: 40 });

    const removed = await api()
      .delete(`/api/groups/${groupId}/members/${target.id}`)
      .set(bearer(manager.token));
    expect(removed.status).toBe(204);

    const access = await api().get(`/api/groups/${groupId}`).set(bearer(target.token));
    expect(access.status).toBe(403);

    // the transactions of the removed member stay in the history, with the name
    const history = await api().get(`/api/groups/${groupId}/transactions`).set(bearer(manager.token));
    expect(history.body.total).toBe(2);
    expect(history.body.items[0].userName).toBe(target.name);

    const again = await api()
      .post(`/api/groups/${groupId}/members`)
      .set(bearer(manager.token))
      .send({ name: 'Other Name', email: target.email, password: 'IgnoredPass1' });
    expect(again.status).toBe(201);
    expect(again.body.member).toMatchObject({ userId: target.id, isNewUser: false });

    const back = await api().get(`/api/groups/${groupId}`).set(bearer(target.token));
    expect(back.status).toBe(200);
    await expect(loginAs(target.email, PASSWORD)).resolves.toEqual(expect.any(String));
  });

  it('is forbidden to a regular member', async () => {
    const { groupId, members } = await createScenario(3);
    const res = await api()
      .delete(`/api/groups/${groupId}/members/${at(members, 1).id}`)
      .set(bearer(at(members, 0).token));
    expect(res.status).toBe(403);
  });

  it('does not remove a member whose balance is not 0', async () => {
    const { groupId, manager, members } = await createScenario(3);
    const target = at(members, 0);
    await postTransaction(target.token, groupId, { type: 'withdraw', amount: 15 });

    const res = await api()
      .delete(`/api/groups/${groupId}/members/${target.id}`)
      .set(bearer(manager.token));
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('BALANCE_NOT_ZERO');
    expect(res.body.error.details).toEqual({ balance: -15 });
  });

  it('keeps at least 3 members, never removes the manager, and returns 404 for a stranger', async () => {
    const { groupId, manager, members } = await createScenario(2);
    const url = `/api/groups/${groupId}/members`;

    const tooFew = await api().delete(`${url}/${at(members, 0).id}`).set(bearer(manager.token));
    expect(tooFew.status).toBe(409);
    expect(tooFew.body.error.code).toBe('MIN_MEMBERS');

    const self = await api().delete(`${url}/${manager.id}`).set(bearer(manager.token));
    expect(self.status).toBe(400);
    expect(self.body.error.code).toBe('CANNOT_REMOVE_MANAGER');

    const stranger = await api().delete(`${url}/9999`).set(bearer(manager.token));
    expect(stranger.status).toBe(404);
  });
});

describe('reset member password', () => {
  it('gives the member a temporary password that must be replaced', async () => {
    const { groupId, manager, members } = await createScenario();
    const target = at(members, 0);

    const res = await api()
      .post(`/api/groups/${groupId}/members/${target.id}/reset-password`)
      .set(bearer(manager.token))
      .send({ newPassword: 'Reset5678' });
    expect(res.status).toBe(204);

    const oldLogin = await api().post('/api/auth/login').send({ email: target.email, password: PASSWORD });
    expect(oldLogin.status).toBe(401);

    const newLogin = await api()
      .post('/api/auth/login')
      .send({ email: target.email, password: 'Reset5678' });
    expect(newLogin.status).toBe(200);
    expect(newLogin.body.user.mustChangePassword).toBe(true);
  });

  it('is forbidden to a regular member, and cannot be used on a non-member or on myself', async () => {
    const mine = await createScenario(2, 'a-');
    const other = await createScenario(2, 'b-');
    const url = `/api/groups/${mine.groupId}/members`;
    const body = { newPassword: 'Reset5678' };

    const byMember = await api()
      .post(`${url}/${at(mine.members, 1).id}/reset-password`)
      .set(bearer(at(mine.members, 0).token))
      .send(body);
    expect(byMember.status).toBe(403);

    // a manager cannot reset the password of a user from another group
    const outsider = await api()
      .post(`${url}/${other.manager.id}/reset-password`)
      .set(bearer(mine.manager.token))
      .send(body);
    expect(outsider.status).toBe(404);
    await expect(loginAs(other.manager.email, PASSWORD)).resolves.toEqual(expect.any(String));

    const self = await api()
      .post(`${url}/${mine.manager.id}/reset-password`)
      .set(bearer(mine.manager.token))
      .send(body);
    expect(self.status).toBe(400);
  });
});
