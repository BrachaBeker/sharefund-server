import { prisma } from '../db/prisma';
import { badRequest, unauthorized } from '../errors/AppError';
import { signAccessToken } from '../utils/jwt';
import { hashPassword, verifyPassword } from '../utils/password';
import type { ChangePasswordInput, LoginInput, UpdateProfileInput } from '../validation/auth.schemas';

/** The only user fields that are ever sent to a client. */
export const publicUserSelect = {
  id: true,
  name: true,
  email: true,
  mustChangePassword: true,
} as const;

export async function login(input: LoginInput) {
  const user = await prisma.user.findUnique({ where: { email: input.email } });

  // The same answer for "no such email" and "wrong password", so emails cannot be guessed.
  const passwordOk = user ? await verifyPassword(input.password, user.passwordHash) : false;
  if (!user || !passwordOk) {
    throw unauthorized('INVALID_CREDENTIALS', 'המייל או הסיסמה שגויים');
  }

  return {
    token: signAccessToken(user.id),
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      mustChangePassword: user.mustChangePassword,
    },
  };
}

export async function changePassword(userId: number, input: ChangePasswordInput) {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });

  if (!(await verifyPassword(input.currentPassword, user.passwordHash))) {
    throw badRequest('WRONG_CURRENT_PASSWORD', 'הסיסמה הנוכחית שגויה');
  }

  return prisma.user.update({
    where: { id: userId },
    data: { passwordHash: await hashPassword(input.newPassword), mustChangePassword: false },
    select: publicUserSelect,
  });
}

export function updateProfile(userId: number, input: UpdateProfileInput) {
  return prisma.user.update({
    where: { id: userId },
    data: { name: input.name },
    select: publicUserSelect,
  });
}
