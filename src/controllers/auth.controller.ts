import type { Request, Response } from 'express';
import { getAuthUser } from '../middleware/context';
import * as authService from '../services/auth.service';
import {
  changePasswordSchema,
  loginSchema,
  updateProfileSchema,
} from '../validation/auth.schemas';

export async function login(req: Request, res: Response): Promise<void> {
  const input = loginSchema.parse(req.body);
  res.json(await authService.login(input));
}

export function me(_req: Request, res: Response): void {
  res.json({ user: getAuthUser(res) });
}

export async function changePassword(req: Request, res: Response): Promise<void> {
  const input = changePasswordSchema.parse(req.body);
  const user = await authService.changePassword(getAuthUser(res).id, input);
  res.json({ user });
}

export async function updateProfile(req: Request, res: Response): Promise<void> {
  const input = updateProfileSchema.parse(req.body);
  const user = await authService.updateProfile(getAuthUser(res).id, input);
  res.json({ user });
}
