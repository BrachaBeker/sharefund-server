import type { NextFunction, Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import { ZodError } from 'zod';
import { AppError } from '../errors/AppError';
import { env } from '../config/env';

interface ErrorBody {
  error: { code: string; message: string; details?: unknown };
}

const send = (res: Response, status: number, code: string, message: string, details?: unknown) => {
  const body: ErrorBody = { error: { code, message } };
  if (details !== undefined) body.error.details = details;
  res.status(status).json(body);
};

export function notFoundHandler(_req: Request, res: Response): void {
  send(res, 404, 'NOT_FOUND', 'הכתובת המבוקשת לא קיימת');
}

// Express recognises an error handler by its four parameters.
export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof AppError) {
    send(res, err.status, err.code, err.message, err.details);
    return;
  }

  if (err instanceof ZodError) {
    const details = err.issues.map((issue) => ({
      field: issue.path.join('.'),
      message: issue.message,
    }));
    send(res, 400, 'VALIDATION_ERROR', 'הנתונים שנשלחו אינם תקינים', details);
    return;
  }

  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2002') {
      send(res, 409, 'ALREADY_EXISTS', 'הרשומה כבר קיימת');
      return;
    }
    if (err.code === 'P2025') {
      send(res, 404, 'NOT_FOUND', 'הרשומה לא נמצאה');
      return;
    }
  }

  // Malformed JSON in the request body
  if (err instanceof SyntaxError && 'body' in err) {
    send(res, 400, 'INVALID_JSON', 'גוף הבקשה אינו JSON תקין');
    return;
  }

  if (env.nodeEnv !== 'test') console.error(err);
  send(res, 500, 'INTERNAL_ERROR', 'אירעה שגיאה בשרת');
}
