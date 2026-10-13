import { z } from 'zod';
import { booleanQuery } from './common.schemas';

export const sendMessageSchema = z
  .object({
    content: z.string().trim().min(1, 'אי אפשר לשלוח הודעה ריקה').max(1000, 'ההודעה ארוכה מדי'),
    // manager only: send to the whole group
    toAll: z.boolean().optional(),
    // manager only: user ids of the chosen members
    recipientIds: z.array(z.number().int().positive()).max(100).optional(),
  })
  .refine((data) => !(data.toAll && data.recipientIds && data.recipientIds.length > 0), {
    path: ['recipientIds'],
    message: 'יש לבחור "לכולם" או רשימת נמענים, לא את שניהם',
  });

export const listMessagesQuerySchema = z.object({
  // inbox = received, sent = sent by me, all = both
  box: z.enum(['all', 'inbox', 'sent']).default('all'),
  unreadOnly: booleanQuery.optional(),
});

export type SendMessageInput = z.infer<typeof sendMessageSchema>;
export type ListMessagesQuery = z.infer<typeof listMessagesQuerySchema>;
