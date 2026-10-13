import type { NextFunction, Request, Response } from 'express';
import { prisma } from '../db/prisma';
import { conflict, forbidden, notFound } from '../errors/AppError';
import { idParam } from '../validation/common.schemas';
import { getAuthUser, getGroupContext, setGroupContext } from './context';

/**
 * Loads the group from the URL and checks that the caller is an active member of it.
 * The role is read from the membership table on every request - it is not stored in the token,
 * because the same user can be a manager in one group and a regular member in another.
 */
export async function loadMembership(req: Request, res: Response, next: NextFunction): Promise<void> {
  const user = getAuthUser(res);
  const groupId = idParam.parse(req.params.groupId);

  const group = await prisma.group.findUnique({ where: { id: groupId } });
  if (!group) throw notFound('GROUP_NOT_FOUND', 'הקבוצה לא נמצאה');

  const membership = await prisma.groupMembership.findUnique({
    where: { userId_groupId: { userId: user.id, groupId } },
  });
  if (!membership || !membership.isActive) {
    throw forbidden('NOT_A_MEMBER', 'אינך חבר בקבוצה זו');
  }

  setGroupContext(res, { group, membership });
  next();
}

export function requireManager(_req: Request, res: Response, next: NextFunction): void {
  if (getGroupContext(res).membership.role !== 'manager') {
    throw forbidden('MANAGER_ONLY', 'הפעולה מותרת למנהל הקבוצה בלבד');
  }
  next();
}

/** A closed group is read-only. */
export function requireOpenGroup(_req: Request, res: Response, next: NextFunction): void {
  if (!getGroupContext(res).group.isActive) {
    throw conflict('GROUP_CLOSED', 'הקבוצה סגורה ואי אפשר לבצע בה פעולות');
  }
  next();
}
