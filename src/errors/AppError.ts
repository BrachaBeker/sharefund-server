/**
 * An error that is safe to send to the client.
 * `code` is a stable English identifier the client can check,
 * `message` is a Hebrew text that can be shown to the user.
 */
export class AppError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export const badRequest = (code: string, message: string, details?: unknown) =>
  new AppError(400, code, message, details);

export const unauthorized = (code: string, message: string) => new AppError(401, code, message);

export const forbidden = (code: string, message: string) => new AppError(403, code, message);

export const notFound = (code: string, message: string) => new AppError(404, code, message);

export const conflict = (code: string, message: string, details?: unknown) =>
  new AppError(409, code, message, details);
