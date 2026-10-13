import { z } from 'zod';
import { emailField, nameField, passwordField } from './common.schemas';

export const loginSchema = z.object({
  email: emailField,
  password: z.string().min(1, 'יש להזין סיסמה').max(72),
});

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, 'יש להזין את הסיסמה הנוכחית').max(72),
    newPassword: passwordField,
  })
  .refine((data) => data.currentPassword !== data.newPassword, {
    path: ['newPassword'],
    message: 'הסיסמה החדשה חייבת להיות שונה מהנוכחית',
  });

export const updateProfileSchema = z.object({
  name: nameField,
});

export type LoginInput = z.infer<typeof loginSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
