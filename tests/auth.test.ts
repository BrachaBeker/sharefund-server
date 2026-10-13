import jwt from 'jsonwebtoken';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  PASSWORD,
  TEMP_PASSWORD,
  api,
  at,
  bearer,
  createScenario,
  loginAs,
  resetDb,
} from './helpers';

beforeEach(resetDb);

describe('login', () => {
  it('returns a token and the user, without any password field', async () => {
    const { manager } = await createScenario();

    const res = await api().post('/api/auth/login').send({ email: manager.email, password: PASSWORD });

    expect(res.status).toBe(200);
    expect(res.body.token).toEqual(expect.any(String));
    expect(res.body.user).toEqual({
      id: manager.id,
      name: 'The Manager',
      email: manager.email,
      mustChangePassword: false,
    });
    // no hash and no password anywhere in the answer
    expect(Object.keys(res.body.user).sort()).toEqual(['email', 'id', 'mustChangePassword', 'name']);
    expect(JSON.stringify(res.body)).not.toMatch(/hash|\$2[aby]\$/i);
    expect(JSON.stringify(res.body)).not.toContain(PASSWORD);
  });

  it('accepts the email in any letter case', async () => {
    await createScenario();
    const res = await api()
      .post('/api/auth/login')
      .send({ email: 'MANAGER@Test.com', password: PASSWORD });
    expect(res.status).toBe(200);
  });

  it('rejects a wrong password with 401', async () => {
    const { manager } = await createScenario();
    const res = await api().post('/api/auth/login').send({ email: manager.email, password: 'wrong-pass' });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
  });

  it('gives the same answer for an unknown email', async () => {
    const res = await api().post('/api/auth/login').send({ email: 'nobody@test.com', password: PASSWORD });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
  });

  it('rejects an invalid body with 400', async () => {
    const res = await api().post('/api/auth/login').send({ email: 'not-an-email' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.details.length).toBeGreaterThan(0);
  });
});

describe('token', () => {
  it('returns the logged-in user for a valid token', async () => {
    const { manager } = await createScenario();
    const res = await api().get('/api/auth/me').set(bearer(manager.token));
    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe(manager.email);
  });

  it('returns 401 without a token', async () => {
    const res = await api().get('/api/auth/me');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('TOKEN_MISSING');
  });

  it('returns 401 for a token that is not a JWT', async () => {
    const res = await api().get('/api/auth/me').set(bearer('not-a-real-token'));
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('TOKEN_INVALID');
  });

  it('returns 401 for a token signed with another secret', async () => {
    const { manager } = await createScenario();
    const forged = jwt.sign({}, 'another-secret-that-the-server-does-not-know', {
      subject: String(manager.id),
    });
    const res = await api().get('/api/auth/me').set(bearer(forged));
    expect(res.status).toBe(401);
  });

  it('returns 401 for an expired token', async () => {
    const { manager } = await createScenario();
    const expired = jwt.sign({}, process.env.JWT_SECRET as string, {
      subject: String(manager.id),
      expiresIn: -60,
    });
    const res = await api().get('/api/auth/me').set(bearer(expired));
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('TOKEN_INVALID');
  });

  it('returns 401 when the header is not a Bearer header', async () => {
    const { manager } = await createScenario();
    const res = await api().get('/api/auth/me').set({ Authorization: manager.token });
    expect(res.status).toBe(401);
  });

  it('gives a token that expires', async () => {
    const { manager } = await createScenario();
    const payload = jwt.decode(manager.token) as { exp?: number; iat?: number };
    expect(payload.exp).toBeGreaterThan(payload.iat as number);
  });
});

describe('temporary password', () => {
  it('blocks every group action until the password is replaced', async () => {
    const res = await api()
      .post('/api/groups')
      .send({
        groupName: 'Locked',
        manager: { name: 'Boss', email: 'boss@test.com', password: PASSWORD },
        members: [
          { name: 'New One', email: 'new1@test.com', password: TEMP_PASSWORD },
          { name: 'New Two', email: 'new2@test.com', password: TEMP_PASSWORD },
        ],
      });
    const groupId = res.body.group.id as number;

    const login = await api()
      .post('/api/auth/login')
      .send({ email: 'new1@test.com', password: TEMP_PASSWORD });
    expect(login.body.user.mustChangePassword).toBe(true);
    const token = login.body.token as string;

    const blockedList = await api().get('/api/groups').set(bearer(token));
    expect(blockedList.status).toBe(403);
    expect(blockedList.body.error.code).toBe('PASSWORD_CHANGE_REQUIRED');

    const blockedGroup = await api().get(`/api/groups/${groupId}`).set(bearer(token));
    expect(blockedGroup.status).toBe(403);

    const blockedCreate = await api()
      .post('/api/groups')
      .set(bearer(token))
      .send({
        groupName: 'Nope',
        members: [
          { name: 'Aaa Bbb', email: 'a@test.com', password: TEMP_PASSWORD },
          { name: 'Ccc Ddd', email: 'c@test.com', password: TEMP_PASSWORD },
        ],
      });
    expect(blockedCreate.status).toBe(403);

    // /me stays open, so the client can find out that a password change is needed
    const me = await api().get('/api/auth/me').set(bearer(token));
    expect(me.status).toBe(200);

    const change = await api()
      .post('/api/auth/change-password')
      .set(bearer(token))
      .send({ currentPassword: TEMP_PASSWORD, newPassword: PASSWORD });
    expect(change.status).toBe(200);
    expect(change.body.user.mustChangePassword).toBe(false);

    const allowed = await api().get('/api/groups').set(bearer(token));
    expect(allowed.status).toBe(200);
  });
});

describe('change password and profile', () => {
  it('rejects a wrong current password', async () => {
    const { manager } = await createScenario();
    const res = await api()
      .post('/api/auth/change-password')
      .set(bearer(manager.token))
      .send({ currentPassword: 'wrong-pass', newPassword: 'Another123' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('WRONG_CURRENT_PASSWORD');
  });

  it('rejects a new password that is too short or equal to the current one', async () => {
    const { manager } = await createScenario();
    const short = await api()
      .post('/api/auth/change-password')
      .set(bearer(manager.token))
      .send({ currentPassword: PASSWORD, newPassword: '123' });
    expect(short.status).toBe(400);

    const same = await api()
      .post('/api/auth/change-password')
      .set(bearer(manager.token))
      .send({ currentPassword: PASSWORD, newPassword: PASSWORD });
    expect(same.status).toBe(400);
  });

  it('replaces the password: the old one stops working', async () => {
    const { manager } = await createScenario();
    await api()
      .post('/api/auth/change-password')
      .set(bearer(manager.token))
      .send({ currentPassword: PASSWORD, newPassword: 'Another123' });

    const oldLogin = await api().post('/api/auth/login').send({ email: manager.email, password: PASSWORD });
    expect(oldLogin.status).toBe(401);
    await expect(loginAs(manager.email, 'Another123')).resolves.toEqual(expect.any(String));
  });

  it('lets a user update their own name, and nothing else', async () => {
    const { members } = await createScenario();
    const member = at(members, 0);

    const res = await api()
      .patch('/api/auth/me')
      .set(bearer(member.token))
      .send({ name: 'New Name', email: 'hacker@test.com' });

    expect(res.status).toBe(200);
    expect(res.body.user.name).toBe('New Name');
    expect(res.body.user.email).toBe(member.email);
  });
});
