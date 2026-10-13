import { z } from 'zod';
import { hasAtMostTwoDecimals } from '../utils/money';

/** A positive integer id that arrives as text in the URL. */
export const idParam = z.coerce.number().int().positive();

export const emailField = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email('כתובת המייל אינה תקינה').max(254));

export const nameField = z.string().trim().min(2, 'השם קצר מדי').max(60, 'השם ארוך מדי');

// bcrypt reads only the first 72 bytes of a password
export const passwordField = z
  .string()
  .min(6, 'הסיסמה חייבת להכיל לפחות 6 תווים')
  .max(72, 'הסיסמה ארוכה מדי');

/** An amount in shekels: positive, up to two digits after the decimal point. */
export const amountField = z
  .number('הסכום חייב להיות מספר')
  .positive('הסכום חייב להיות גדול מ-0')
  .max(1_000_000, 'הסכום גדול מדי')
  .refine(hasAtMostTwoDecimals, 'מותרות עד שתי ספרות אחרי הנקודה');

export const categoryField = z.enum(['meeting', 'equipment', 'general', 'other']);

export const noteField = z.string().trim().max(300, 'ההערה ארוכה מדי');

/** "true" / "false" in a query string */
export const booleanQuery = z.enum(['true', 'false']).transform((v) => v === 'true');
