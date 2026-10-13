import type { Request, Response } from 'express';
import { getGroupContext } from '../middleware/context';
import * as memberService from '../services/member.service';
import { idParam } from '../validation/common.schemas';
import {
  listMembersQuerySchema,
  newMemberSchema,
  resetPasswordSchema,
} from '../validation/group.schemas';

export async function listMembers(req: Request, res: Response): Promise<void> {
  const query = listMembersQuerySchema.parse(req.query);
  const { membership } = getGroupContext(res);
  res.json({ members: await memberService.listMembers(membership, query) });
}

export async function addMember(req: Request, res: Response): Promise<void> {
  const input = newMemberSchema.parse(req.body);
  const { group } = getGroupContext(res);
  res.status(201).json({ member: await memberService.addMember(group.id, input) });
}

export async function removeMember(req: Request, res: Response): Promise<void> {
  const userId = idParam.parse(req.params.userId);
  const { group } = getGroupContext(res);
  await memberService.removeMember(group.id, userId);
  res.status(204).end();
}

export async function resetPassword(req: Request, res: Response): Promise<void> {
  const userId = idParam.parse(req.params.userId);
  const { newPassword } = resetPasswordSchema.parse(req.body);
  const { group, membership } = getGroupContext(res);
  await memberService.resetMemberPassword(group.id, membership.userId, userId, newPassword);
  res.status(204).end();
}
