import { beforeEach, describe, expect, it } from 'vitest';
import { api, at, bearer, createScenario, resetDb } from './helpers';

beforeEach(resetDb);

const send = (token: string, groupId: number, body: Record<string, unknown>) =>
  api().post(`/api/groups/${groupId}/messages`).set(bearer(token)).send(body);

const list = (token: string, groupId: number, query = '') =>
  api().get(`/api/groups/${groupId}/messages${query}`).set(bearer(token));

describe('messages', () => {
  it('the manager sends to everyone, and every member receives it as unread', async () => {
    const { groupId, manager, members } = await createScenario();

    const sent = await send(manager.token, groupId, { content: 'Hello all', toAll: true });
    expect(sent.status).toBe(201);
    expect(sent.body.message).toMatchObject({ toAll: true, direction: 'sent', isRead: null });
    expect(sent.body.message.recipients).toHaveLength(3);

    for (const member of members) {
      const inbox = await list(member.token, groupId);
      expect(inbox.body.unreadCount).toBe(1);
      expect(inbox.body.items).toHaveLength(1);
      expect(inbox.body.items[0]).toMatchObject({
        content: 'Hello all',
        direction: 'received',
        isRead: false,
        recipients: null,
        sender: { id: manager.id, name: 'The Manager' },
      });
    }
  });

  it('the manager sends to chosen members only', async () => {
    const { groupId, manager, members } = await createScenario();
    const [a, b, c] = [at(members, 0), at(members, 1), at(members, 2)];

    const sent = await send(manager.token, groupId, {
      content: 'Please pay',
      recipientIds: [a.id, b.id],
    });
    expect(sent.status).toBe(201);
    expect(sent.body.message.toAll).toBe(false);

    expect((await list(a.token, groupId)).body.items).toHaveLength(1);
    expect((await list(b.token, groupId)).body.items).toHaveLength(1);
    expect((await list(c.token, groupId)).body.items).toHaveLength(0);
  });

  it('a member writes to the manager only, and other members never see it', async () => {
    const { groupId, manager, members } = await createScenario();
    const [a, b] = [at(members, 0), at(members, 1)];

    const sent = await send(a.token, groupId, { content: 'Got it, will pay tomorrow' });
    expect(sent.status).toBe(201);
    expect(sent.body.message.recipients).toEqual([
      { userId: manager.id, name: 'The Manager', readAt: null },
    ]);

    const managerInbox = await list(manager.token, groupId, '?box=inbox');
    expect(managerInbox.body.items).toHaveLength(1);
    expect(managerInbox.body.items[0].sender).toEqual({ id: a.id, name: a.name });

    expect((await list(b.token, groupId)).body.items).toHaveLength(0);
  });

  it('forbids a member to choose recipients or to send to everyone', async () => {
    const { groupId, members } = await createScenario();
    const [a, b] = [at(members, 0), at(members, 1)];

    const toMember = await send(a.token, groupId, { content: 'psst', recipientIds: [b.id] });
    expect(toMember.status).toBe(403);
    expect(toMember.body.error.code).toBe('MANAGER_ONLY');

    const toAll = await send(a.token, groupId, { content: 'hey all', toAll: true });
    expect(toAll.status).toBe(403);

    expect((await list(b.token, groupId)).body.items).toHaveLength(0);
  });

  it('validates the recipients of the manager', async () => {
    const mine = await createScenario(2, 'a-');
    const other = await createScenario(2, 'b-');
    const { groupId, manager, members } = mine;

    const none = await send(manager.token, groupId, { content: 'to whom?' });
    expect(none.status).toBe(400);
    expect(none.body.error.code).toBe('RECIPIENTS_REQUIRED');

    const stranger = await send(manager.token, groupId, {
      content: 'hi',
      recipientIds: [other.manager.id],
    });
    expect(stranger.status).toBe(400);
    expect(stranger.body.error.code).toBe('MEMBER_NOT_FOUND');

    const both = await send(manager.token, groupId, {
      content: 'hi',
      toAll: true,
      recipientIds: [at(members, 0).id],
    });
    expect(both.status).toBe(400);

    const empty = await send(manager.token, groupId, { content: '   ' });
    expect(empty.status).toBe(400);
  });

  it('marks a message as read, and filters by box and unread', async () => {
    const { groupId, manager, members } = await createScenario();
    const a = at(members, 0);
    const first = await send(manager.token, groupId, { content: 'one', toAll: true });
    await send(manager.token, groupId, { content: 'two', toAll: true });
    await send(a.token, groupId, { content: 'reply' });

    const read = await api()
      .post(`/api/groups/${groupId}/messages/${first.body.message.id}/read`)
      .set(bearer(a.token));
    expect(read.status).toBe(204);

    const all = await list(a.token, groupId);
    expect(all.body.unreadCount).toBe(1);
    expect(all.body.items.map((m: { content: string }) => m.content)).toEqual(['reply', 'two', 'one']);

    const unread = await list(a.token, groupId, '?unreadOnly=true');
    expect(unread.body.items.map((m: { content: string }) => m.content)).toEqual(['two']);

    const sentBox = await list(a.token, groupId, '?box=sent');
    expect(sentBox.body.items.map((m: { content: string }) => m.content)).toEqual(['reply']);

    // the manager sees who opened the message
    const managerSent = await list(manager.token, groupId, '?box=sent');
    const one = managerSent.body.items.find((m: { content: string }) => m.content === 'one');
    const readers = one.recipients.filter((r: { readAt: string | null }) => r.readAt !== null);
    expect(readers).toHaveLength(1);
    expect(readers[0].userId).toBe(a.id);
  });

  it('returns 404 when marking a message that was not sent to me', async () => {
    const { groupId, manager, members } = await createScenario();
    const [a, b] = [at(members, 0), at(members, 1)];
    const sent = await send(manager.token, groupId, { content: 'private', recipientIds: [a.id] });

    const res = await api()
      .post(`/api/groups/${groupId}/messages/${sent.body.message.id}/read`)
      .set(bearer(b.token));
    expect(res.status).toBe(404);
  });
});
