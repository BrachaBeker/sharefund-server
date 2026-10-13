import type { NextFunction, Request, Response } from 'express';
import { prisma } from '../db/prisma';
import { forbidden, unauthorized } from '../errors/AppError';
import { verifyAccessToken } from '../utils/jwt';
import { getAuthUser, setAuthUser, type AuthUser } from './context';

function readBearerToken(req: Request): string | null {
  const header = req.headers.authorization;
  if (!header) return null;
  const [scheme, token] = header.split(' ');
  if (scheme !== 'Bearer' || !token) return null;
  return token;
}

async function loadUserFromToken(token: string): Promise<AuthUser> {
  const userId = verifyAccessToken(token);
  if (!userId) throw unauthorized('TOKEN_INVALID', 'הטוקן אינו תקין או שפג תוקפו');

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, name: true, email: true, mustChangePassword: true },
  });
  if (!user) throw unauthorized('TOKEN_INVALID', 'הטוקן אינו תקין או שפג תוקפו');
  return user;
}

/** Requires a valid Bearer token. The user is always identified by the token, never by the request body. */
export async function authenticate(req: Request, res: Response, next: NextFunction): Promise<void> {
  const token = readBearerToken(req);
  if (!token) throw unauthorized('TOKEN_MISSING', 'נדרשת התחברות');
  setAuthUser(res, await loadUserFromToken(token));
  next();
}

/** For routes that guests may use too: no token = guest, but a token that was sent must be valid. */
export async function optionalAuthenticate(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  if (req.headers.authorization) {
    const token = readBearerToken(req);
    if (!token) throw unauthorized('TOKEN_INVALID', 'הטוקן אינו תקין או שפג תוקפו');
    setAuthUser(res, await loadUserFromToken(token));
  }
  next();
}

/** Blocks every action while the user still has a temporary password. */
export function requirePasswordChanged(_req: Request, res: Response, next: NextFunction): void {
  if (getAuthUser(res).mustChangePassword) {
    throw forbidden('PASSWORD_CHANGE_REQUIRED', 'יש להחליף את הסיסמה הזמנית לפני המשך השימוש');
  }
  next();
}
