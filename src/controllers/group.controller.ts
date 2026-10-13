import type { Request, Response } from 'express';
import { forbidden } from '../errors/AppError';
import { getAuthUser, getGroupContext, getOptionalAuthUser } from '../middleware/context';
import * as groupService from '../services/group.service';
import { closeGroupSchema, createGroupSchema } from '../validation/group.schemas';

export async function createGroup(req: Request, res: Response): Promise<void> {
  const actor = getOptionalAuthUser(res);
  if (actor?.mustChangePassword) {
    throw forbidden('PASSWORD_CHANGE_REQUIRED', 'יש להחליף את הסיסמה הזמנית לפני המשך השימוש');
  }
  const input = createGroupSchema.parse(req.body);
  res.status(201).json(await groupService.createGroup(actor, input));
}

export async function listMyGroups(_req: Request, res: Response): Promise<void> {
  res.json({ groups: await groupService.listMyGroups(getAuthUser(res).id) });
}

export async function getDashboard(_req: Request, res: Response): Promise<void> {
  const { group, membership } = getGroupContext(res);
  res.json({ group: await groupService.getDashboard(group, membership) });
}

export async function closeGroup(req: Request, res: Response): Promise<void> {
  const { force } = closeGroupSchema.parse(req.body ?? {});
  const { group } = getGroupContext(res);
  res.json({ group: await groupService.closeGroup(group.id, force) });
}

export async function leaveGroup(_req: Request, res: Response): Promise<void> {
  const { group, membership } = getGroupContext(res);
  await groupService.leaveGroup(group.id, membership.userId);
  res.status(204).end();
}
