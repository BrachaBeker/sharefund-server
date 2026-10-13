import jwt, { type SignOptions } from 'jsonwebtoken';
import { env } from '../config/env';

/** Creates a signed access token that identifies the user. The role is NOT stored in it. */
export function signAccessToken(userId: number): string {
  const options: SignOptions = {
    subject: String(userId),
    expiresIn: env.jwtExpiresIn as SignOptions['expiresIn'],
  };
  return jwt.sign({}, env.jwtSecret, options);
}

/** Returns the user id from a valid token, or null when the token is invalid or expired. */
export function verifyAccessToken(token: string): number | null {
  try {
    const payload = jwt.verify(token, env.jwtSecret);
    if (typeof payload === 'string') return null;
    const userId = Number(payload.sub);
    return Number.isInteger(userId) && userId > 0 ? userId : null;
  } catch {
    return null;
  }
}
