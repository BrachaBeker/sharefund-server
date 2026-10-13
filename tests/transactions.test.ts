import { beforeEach, describe, expect, it } from 'vitest';
import {
  api,
  at,
  balances,
  bearer,
  createScenario,
  fundBalance,
  postTransaction,
  resetDb,
} from './helpers';

beforeEach(resetDb);

const sum = (values: number[]) => Math.round(values.reduce((a, b) => a + b, 0) * 100) / 100;

describe('deposit and withdraw', () => {
  it('a deposit raises my balance and the fund', async () => {
    const { groupId, manager, members } = await createScenario();
    const member = at(members, 0);

    const res = await postTransaction(member.token, groupId, {
      type: 'deposit',
      amount: 50.25,
      category: 'meeting',
      note: 'for the party',
    });

    expect(res.status).toBe(201);
    expect(res.body.transaction).toMatchObject({
      type: 'deposit',
      amount: 50.25,
      isShared: false,
      category: 'meeting',
      note: 'for the party',
      fundBalanceAfter: 50.25,
      isMine: true,
      userId: member.id,
      userName: member.name,
    });
    expect((await balances(manager.token, groupId))[member.id]).toBe(50.25);
    expect(await fundBalance(manager.token, groupId)).toBe(50.25);
  });

  it('a personal withdraw lowers only my balance, and the fund may go below 0', async () => {
    const { groupId, manager, members } = await createScenario();
    const member = at(members, 0);

    const res = await postTransaction(member.token, groupId, { type: 'withdraw', amount: 30 });

    expect(res.status).toBe(201);
    expect(res.body.transaction.fundBalanceAfter).toBe(-30);
    const all = await balances(manager.token, groupId);
    expect(all[member.id]).toBe(-30);
    expect(all[manager.id]).toBe(0);
    expect(await fundBalance(manager.token, groupId)).toBe(-30);
  });

  it('a shared withdraw is split equally between all the active members', async () => {
    const { groupId, manager, members } = await createScenario(2);
    for (const person of [manager, ...members]) {
      await postTransaction(person.token, groupId, { type: 'deposit', amount: 20 });
    }

    const res = await postTransaction(manager.token, groupId, {
      type: 'withdraw',
      amount: 60,
      isShared: true,
      note: 'room rent',
    });

    expect(res.status).toBe(201);
    expect(res.body.transaction).toMatchObject({ isShared: true, fundBalanceAfter: 0 });
    expect(Object.values(await balances(manager.token, groupId))).toEqual([0, 0, 0]);
  });

  it('gives the leftover agora of an uneven split to the member who withdrew', async () => {
    const { groupId, manager, members } = await createScenario(2);
    const withdrawer = at(members, 0);

    await postTransaction(withdrawer.token, groupId, { type: 'withdraw', amount: 100, isShared: true });

    const all = await balances(manager.token, groupId);
    expect(all[withdrawer.id]).toBe(-33.34);
    expect(all[manager.id]).toBe(-33.33);
    expect(all[at(members, 1).id]).toBe(-33.33);
    expect(await fundBalance(manager.token, groupId)).toBe(-100);
  });

  it('does not charge a member who left for a later shared withdraw', async () => {
    const { groupId, manager, members } = await createScenario(3);
    await api().post(`/api/groups/${groupId}/leave`).set(bearer(at(members, 2).token));

    await postTransaction(manager.token, groupId, { type: 'withdraw', amount: 90, isShared: true });

    expect(Object.values(await balances(manager.token, groupId))).toEqual([-30, -30, -30]);
  });

  it('keeps the fund equal to the sum of the member balances', async () => {
    const { groupId, manager, members } = await createScenario(3);
    const [a, b, c] = [at(members, 0), at(members, 1), at(members, 2)];
    await postTransaction(a.token, groupId, { type: 'deposit', amount: 70.1 });
    await postTransaction(b.token, groupId, { type: 'withdraw', amount: 12.34 });
    await postTransaction(c.token, groupId, { type: 'withdraw', amount: 45.55, isShared: true });
    await postTransaction(manager.token, groupId, { type: 'deposit', amount: 0.01 });

    const expected = sum([70.1, -12.34, -45.55, 0.01]);
    expect(sum(Object.values(await balances(manager.token, groupId)))).toBe(expected);
    expect(await fundBalance(manager.token, groupId)).toBe(expected);
  });

  it('rejects invalid amounts and invalid combinations', async () => {
    const { groupId, members } = await createScenario();
    const token = at(members, 0).token;
    const invalid = [
      { type: 'deposit', amount: 0 },
      { type: 'deposit', amount: -5 },
      { type: 'deposit', amount: 10.123 },
      { type: 'deposit', amount: '10' },
      { type: 'deposit' },
      { type: 'gift', amount: 10 },
      { type: 'deposit', amount: 10, isShared: true },
      { type: 'deposit', amount: 10, category: 'food' },
      { type: 'deposit', amount: 5_000_000 },
    ];
    for (const body of invalid) {
      const res = await postTransaction(token, groupId, body);
      expect(res.status, JSON.stringify(body)).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    }
    const history = await api().get(`/api/groups/${groupId}/transactions`).set(bearer(token));
    expect(history.body.total).toBe(0);
  });

  it('always records the transaction on the user of the token, whatever the body says', async () => {
    const { groupId, manager, members } = await createScenario();
    const [attacker, victim] = [at(members, 0), at(members, 1)];

    await postTransaction(attacker.token, groupId, {
      type: 'withdraw',
      amount: 500,
      userId: victim.id,
    });

    const all = await balances(manager.token, groupId);
    expect(all[victim.id]).toBe(0);
    expect(all[attacker.id]).toBe(-500);
  });
});

describe('bulk recording by the manager', () => {
  it('records a different amount for every member', async () => {
    const { groupId, manager, members } = await createScenario();
    const [a, b] = [at(members, 0), at(members, 1)];

    const res = await api()
      .post(`/api/groups/${groupId}/transactions/bulk`)
      .set(bearer(manager.token))
      .send({
        type: 'deposit',
        category: 'meeting',
        note: 'collection',
        items: [
          { userId: a.id, amount: 50 },
          { userId: b.id, amount: 30.5 },
        ],
      });

    expect(res.status).toBe(201);
    expect(res.body.transactions).toHaveLength(2);
    expect(res.body.transactions[0]).toMatchObject({
      userId: a.id,
      amount: 50,
      fundBalanceAfter: 50,
      recordedByName: 'The Manager',
    });
    expect(res.body.transactions[1]).toMatchObject({ userId: b.id, fundBalanceAfter: 80.5 });

    const all = await balances(manager.token, groupId);
    expect(all[a.id]).toBe(50);
    expect(all[b.id]).toBe(30.5);
  });

  it('can bring the balance of a member back to 0', async () => {
    const { groupId, manager, members } = await createScenario();
    const debtor = at(members, 0);
    await postTransaction(debtor.token, groupId, { type: 'withdraw', amount: 40 });

    await api()
      .post(`/api/groups/${groupId}/transactions/bulk`)
      .set(bearer(manager.token))
      .send({ type: 'deposit', note: 'paid in cash', items: [{ userId: debtor.id, amount: 40 }] });

    expect((await balances(manager.token, groupId))[debtor.id]).toBe(0);
  });

  it('is forbidden to a regular member', async () => {
    const { groupId, members } = await createScenario();
    const res = await api()
      .post(`/api/groups/${groupId}/transactions/bulk`)
      .set(bearer(at(members, 0).token))
      .send({ type: 'deposit', items: [{ userId: at(members, 0).id, amount: 1000 }] });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('MANAGER_ONLY');
  });

  it('saves nothing when one of the members is not in the group', async () => {
    const mine = await createScenario(2, 'a-');
    const other = await createScenario(2, 'b-');

    const res = await api()
      .post(`/api/groups/${mine.groupId}/transactions/bulk`)
      .set(bearer(mine.manager.token))
      .send({
        type: 'deposit',
        items: [
          { userId: at(mine.members, 0).id, amount: 50 },
          { userId: other.manager.id, amount: 50 },
        ],
      });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('MEMBER_NOT_FOUND');
    expect(Object.values(await balances(mine.manager.token, mine.groupId))).toEqual([0, 0, 0]);
    expect(await fundBalance(other.manager.token, other.groupId)).toBe(0);
  });

  it('rejects the same member twice and an empty list', async () => {
    const { groupId, manager, members } = await createScenario();
    const url = `/api/groups/${groupId}/transactions/bulk`;
    const twice = await api()
      .post(url)
      .set(bearer(manager.token))
      .send({
        type: 'deposit',
        items: [
          { userId: at(members, 0).id, amount: 5 },
          { userId: at(members, 0).id, amount: 5 },
        ],
      });
    expect(twice.status).toBe(400);
    const empty = await api().post(url).set(bearer(manager.token)).send({ type: 'deposit', items: [] });
    expect(empty.status).toBe(400);
  });
});

describe('history', () => {
  async function seedHistory() {
    const scenario = await createScenario();
    const { groupId, manager, members } = scenario;
    const [a, b] = [at(members, 0), at(members, 1)];
    await postTransaction(a.token, groupId, {
      type: 'deposit',
      amount: 50,
      category: 'meeting',
      note: 'Party money',
    });
    await postTransaction(b.token, groupId, {
      type: 'deposit',
      amount: 30,
      category: 'equipment',
      note: 'Balls',
    });
    await postTransaction(manager.token, groupId, {
      type: 'withdraw',
      amount: 40,
      isShared: true,
      category: 'meeting',
      note: 'Room rent for the party',
    });
    await postTransaction(a.token, groupId, { type: 'withdraw', amount: 5, category: 'other' });
    return { ...scenario, a, b, url: `/api/groups/${groupId}/transactions` };
  }

  it('shows the manager who made every transaction, newest first', async () => {
    const { manager, a, b, url } = await seedHistory();
    const res = await api().get(url).set(bearer(manager.token));

    expect(res.status).toBe(200);
    expect(res.body.summary).toEqual({ totalDeposited: 80, fundBalance: 35 });
    expect(res.body.total).toBe(4);
    expect(res.body.items.map((t: { userName: string }) => t.userName)).toEqual([
      a.name,
      'The Manager',
      b.name,
      a.name,
    ]);
    expect(res.body.items.map((t: { fundBalanceAfter: number }) => t.fundBalanceAfter)).toEqual([
      35, 40, 80, 50,
    ]);
  });

  it('hides from a regular member who made the transactions of others', async () => {
    const { a, b, url } = await seedHistory();
    const res = await api().get(url).set(bearer(a.token));

    expect(res.status).toBe(200);
    expect(res.body.summary).toEqual({ totalDeposited: 80, fundBalance: 35 });
    expect(res.body.total).toBe(4);

    for (const item of res.body.items as Record<string, unknown>[]) {
      if (item.isMine) {
        expect(item).toMatchObject({ userId: a.id, userName: a.name });
      } else {
        expect(item).toMatchObject({ userId: null, userName: null, recordedByName: null });
        expect(item.amount).toEqual(expect.any(Number));
      }
    }
    expect(res.body.items.filter((t: { isMine: boolean }) => t.isMine)).toHaveLength(2);
    expect(JSON.stringify(res.body)).not.toContain(b.name);
    expect(JSON.stringify(res.body)).not.toContain('The Manager');
  });

  it('filters by type, category, member, own transactions and free text', async () => {
    const { manager, a, b, url } = await seedHistory();
    const total = async (token: string, query: string) =>
      (await api().get(`${url}?${query}`).set(bearer(token))).body.total as number;

    expect(await total(manager.token, 'type=deposit')).toBe(2);
    expect(await total(manager.token, 'type=withdraw')).toBe(2);
    expect(await total(manager.token, 'category=meeting')).toBe(2);
    expect(await total(manager.token, 'category=meeting&type=withdraw')).toBe(1);
    expect(await total(manager.token, `userId=${b.id}`)).toBe(1);
    expect(await total(manager.token, 'mine=true')).toBe(1);
    expect(await total(a.token, 'mine=true')).toBe(2);
    expect(await total(manager.token, 'search=party')).toBe(2);
    expect(await total(manager.token, 'search=member 2')).toBe(1);
    // a regular member cannot find transactions by the name of another member
    expect(await total(a.token, 'search=member 2')).toBe(0);
    expect(await total(a.token, 'search=balls')).toBe(1);
  });

  it('does not let a regular member filter by another member', async () => {
    const { a, b, url } = await seedHistory();
    const other = await api().get(`${url}?userId=${b.id}`).set(bearer(a.token));
    expect(other.status).toBe(403);
    const own = await api().get(`${url}?userId=${a.id}`).set(bearer(a.token));
    expect(own.status).toBe(200);
    expect(own.body.total).toBe(2);
  });

  it('filters by dates, sorts and pages', async () => {
    const { manager, url } = await seedHistory();
    const get = (query: string) => api().get(`${url}?${query}`).set(bearer(manager.token));

    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    expect((await get(`from=${yesterday}&to=${tomorrow}`)).body.total).toBe(4);
    expect((await get(`from=${tomorrow}`)).body.total).toBe(0);
    expect((await get(`to=${yesterday}`)).body.total).toBe(0);
    expect((await get('from=not-a-date')).status).toBe(400);

    const oldest = await get('sort=oldest');
    expect(oldest.body.items.map((t: { fundBalanceAfter: number }) => t.fundBalanceAfter)).toEqual([
      50, 80, 40, 35,
    ]);

    const secondPage = await get('page=2&pageSize=3');
    expect(secondPage.body).toMatchObject({ page: 2, pageSize: 3, total: 4 });
    expect(secondPage.body.items).toHaveLength(1);

    expect((await get('pageSize=0')).status).toBe(400);
  });
});

describe('edit a transaction', () => {
  it('lets the owner edit the category and the note, but never the amount', async () => {
    const { groupId, manager, members } = await createScenario();
    const owner = at(members, 0);
    const created = await postTransaction(owner.token, groupId, { type: 'deposit', amount: 50 });
    const id = created.body.transaction.id as number;

    const res = await api()
      .patch(`/api/groups/${groupId}/transactions/${id}`)
      .set(bearer(owner.token))
      .send({ category: 'equipment', note: 'fixed note', amount: 9999, type: 'withdraw' });

    expect(res.status).toBe(200);
    expect(res.body.transaction).toMatchObject({
      category: 'equipment',
      note: 'fixed note',
      amount: 50,
      type: 'deposit',
    });
    expect((await balances(manager.token, groupId))[owner.id]).toBe(50);
  });

  it('lets the manager edit any transaction, and forbids other members', async () => {
    const { groupId, manager, members } = await createScenario();
    const created = await postTransaction(at(members, 0).token, groupId, { type: 'deposit', amount: 50 });
    const url = `/api/groups/${groupId}/transactions/${created.body.transaction.id}`;

    const byOther = await api().patch(url).set(bearer(at(members, 1).token)).send({ note: 'hacked' });
    expect(byOther.status).toBe(403);
    expect(byOther.body.error.code).toBe('NOT_YOUR_TRANSACTION');

    const byManager = await api().patch(url).set(bearer(manager.token)).send({ note: 'checked' });
    expect(byManager.status).toBe(200);
    expect(byManager.body.transaction.note).toBe('checked');
  });

  it('returns 404 for a transaction of another group, and 400 for an empty update', async () => {
    const mine = await createScenario(2, 'a-');
    const other = await createScenario(2, 'b-');
    const foreign = await postTransaction(other.manager.token, other.groupId, {
      type: 'deposit',
      amount: 10,
    });

    const res = await api()
      .patch(`/api/groups/${mine.groupId}/transactions/${foreign.body.transaction.id}`)
      .set(bearer(mine.manager.token))
      .send({ note: 'x' });
    expect(res.status).toBe(404);

    const empty = await api()
      .patch(`/api/groups/${other.groupId}/transactions/${foreign.body.transaction.id}`)
      .set(bearer(other.manager.token))
      .send({});
    expect(empty.status).toBe(400);
  });
});
