import type { Request, Response } from 'express';
import { getGroupContext } from '../middleware/context';
import * as messageService from '../services/message.service';
import { idParam } from '../validation/common.schemas';
import { listMessagesQuerySchema, sendMessageSchema } from '../validation/message.schemas';

export async function listMessages(req: Request, res: Response): Promise<void> {
  const query = listMessagesQuerySchema.parse(req.query);
  const { membership } = getGroupContext(res);
  res.json(await messageService.listMessages(membership, query));
}

export async function sendMessage(req: Request, res: Response): Promise<void> {
  const input = sendMessageSchema.parse(req.body);
  const { membership } = getGroupContext(res);
  res.status(201).json({ message: await messageService.sendMessage(membership, input) });
}

export async function markAsRead(req: Request, res: Response): Promise<void> {
  const messageId = idParam.parse(req.params.messageId);
  const { membership } = getGroupContext(res);
  await messageService.markAsRead(membership, messageId);
  res.status(204).end();
}
