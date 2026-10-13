import { z } from 'zod';
import { amountField, booleanQuery, categoryField, idParam, noteField } from './common.schemas';

const typeField = z.enum(['deposit', 'withdraw']);

/** A member records a deposit or a withdraw on their own name. */
export const createTransactionSchema = z
  .object({
    type: typeField,
    amount: amountField,
    // only for withdraw: true = a group expense that is split between all active members
    isShared: z.boolean().default(false),
    category: categoryField.default('general'),
    note: noteField.default(''),
  })
  .refine((data) => !(data.type === 'deposit' && data.isShared), {
    path: ['isShared'],
    message: 'רק משיכה יכולה להיות משותפת',
  });

/** The manager records one deposit / withdraw per member, each with its own amount. */
export const bulkTransactionSchema = z
  .object({
    type: typeField,
    category: categoryField.default('general'),
    note: noteField.default(''),
    items: z
      .array(z.object({ userId: z.number().int().positive(), amount: amountField }))
      .min(1, 'יש להזין סכום לחבר אחד לפחות')
      .max(100),
  })
  .refine((data) => new Set(data.items.map((i) => i.userId)).size === data.items.length, {
    path: ['items'],
    message: 'אותו חבר מופיע יותר מפעם אחת',
  });

export const updateTransactionSchema = z
  .object({
    category: categoryField.optional(),
    note: noteField.optional(),
  })
  .refine((data) => data.category !== undefined || data.note !== undefined, {
    message: 'יש לשלוח קטגוריה או הערה לעדכון',
  });

const dateQuery = z.coerce.date('תאריך לא תקין');

export const listTransactionsQuerySchema = z.object({
  // free text: searched in the note (and, for a manager, also in the member name)
  search: z.string().trim().max(60).optional(),
  type: typeField.optional(),
  category: categoryField.optional(),
  // manager only: transactions of one member
  userId: idParam.optional(),
  // only my own transactions
  mine: booleanQuery.optional(),
  from: dateQuery.optional(),
  to: dateQuery.optional(),
  sort: z.enum(['newest', 'oldest']).default('newest'),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
});

export type CreateTransactionInput = z.infer<typeof createTransactionSchema>;
export type BulkTransactionInput = z.infer<typeof bulkTransactionSchema>;
export type UpdateTransactionInput = z.infer<typeof updateTransactionSchema>;
export type ListTransactionsQuery = z.infer<typeof listTransactionsQuerySchema>;
