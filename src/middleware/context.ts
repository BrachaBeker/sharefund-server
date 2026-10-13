import type { Response } from 'express';
import type { Group, GroupMembership } from '@prisma/client';
import { unauthorized } from '../errors/AppError';

/** The logged-in user, as loaded from the database by `authenticate`. Never contains the password hash. */
export interface AuthUser {
  id: number;
  name: string;
  email: string;
  mustChangePassword: boolean;
}

/** The group from the URL and the caller's membership in it, as loaded by `loadMembership`. */
export interface GroupContext {
  group: Group;
  membership: GroupMembership;
}

interface Locals {
  user?: AuthUser;
  groupContext?: GroupContext;
}

const locals = (res: Response): Locals => res.locals as Locals;

export function setAuthUser(res: Response, user: AuthUser): void {
  locals(res).user = user;
}

export function getOptionalAuthUser(res: Response): AuthUser | null {
  return locals(res).user ?? null;
}

export function getAuthUser(res: Response): AuthUser {
  const user = locals(res).user;
  if (!user) throw unauthorized('TOKEN_MISSING', 'נדרשת התחברות');
  return user;
}

export function setGroupContext(res: Response, context: GroupContext): void {
  locals(res).groupContext = context;
}

export function getGroupContext(res: Response): GroupContext {
  const context = locals(res).groupContext;
  if (!context) throw new Error('loadMembership middleware is missing on this route');
  return context;
}
