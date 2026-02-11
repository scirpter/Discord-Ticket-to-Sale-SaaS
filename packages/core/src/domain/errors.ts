import type { ZodIssue } from 'zod';

export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly details?: unknown;

  constructor(code: string, message: string, statusCode = 400, details?: unknown) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
  }
}

export function fromUnknownError(error: unknown, fallbackCode = 'INTERNAL_ERROR'): AppError {
  if (error instanceof AppError) {
    return error;
  }

  if (error instanceof Error) {
    return new AppError(fallbackCode, error.message, 500);
  }

  return new AppError(fallbackCode, 'Unexpected error', 500);
}

export function validationError(issues: ZodIssue[]): AppError {
  return new AppError('VALIDATION_ERROR', 'Validation failed', 422, issues);
}
