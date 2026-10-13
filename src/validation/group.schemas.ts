import { z } from 'zod';
import { emailField, nameField, passwordField } from './common.schemas';

/** A person added to a group: used in "create group" and in "add member". */
export const newMemberSchema = z.object({
  name: nameField,
  email: emailField,
  // temporary password - ignored when the email already belongs to an existing user
  password: passwordField,
});

export const createGroupSchema = z
  .object({
    groupName: z.string().trim().min(2, 'שם הקבוצה קצר מדי').max(60, 'שם הקבוצה ארוך מדי'),
    // required for a guest, ignored for a logged-in user (who becomes the manager)
    manager: newMemberSchema.optional(),
    // the members besides the manager: at least 2, so the group has at least 3 people
    members: z
      .array(newMemberSchema)
      .min(2, 'קבוצה חייבת לכלול לפחות 3 חברים (המנהל ועוד 2)')
      .max(50, 'יותר מדי חברים'),
  })
  .refine((data) => new Set(data.members.map((m) => m.email)).size === data.members.length, {
    path: ['members'],
    message: 'אותו מייל מופיע יותר מפעם אחת ברשימת החברים',
  })
  .refine((data) => !data.manager || !data.members.some((m) => m.email === data.manager?.email), {
    path: ['members'],
    message: 'מייל המנהל לא יכול להופיע ברשימת החברים',
  });

export const closeGroupSchema = z.object({
  // must be true to close a group whose balances are not all 0
  force: z.boolean().default(false),
});

export const listMembersQuerySchema = z.object({
  search: z.string().trim().max(60).optional(),
  balanceStatus: z.enum(['debt', 'zero', 'credit']).optional(),
});

export const resetPasswordSchema = z.object({
  newPassword: passwordField,
});

export type NewMemberInput = z.infer<typeof newMemberSchema>;
export type CreateGroupInput = z.infer<typeof createGroupSchema>;
export type ListMembersQuery = z.infer<typeof listMembersQuerySchema>;
