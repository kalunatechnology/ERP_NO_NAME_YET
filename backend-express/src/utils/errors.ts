/**
 * Standard application error classes.
 * Used for centralized error handling in error.middleware.ts
 */

export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly errors?: unknown;

  constructor(message: string, statusCode = 400, code = 'BAD_REQUEST', errors?: unknown) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
    this.errors = errors;
    // Maintain proper stack trace
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }
}

export class NotFoundError extends AppError {
  constructor(resource = 'Resource') {
    super(`${resource} tidak ditemukan.`, 404, 'NOT_FOUND');
    this.name = 'NotFoundError';
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Token autentikasi tidak valid atau tidak tersedia.') {
    super(message, 401, 'UNAUTHORIZED');
    this.name = 'UnauthorizedError';
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Anda tidak memiliki izin untuk mengakses resource ini.') {
    super(message, 403, 'FORBIDDEN');
    this.name = 'ForbiddenError';
  }
}

export class ValidationError extends AppError {
  constructor(message: string, errors?: unknown) {
    super(message, 400, 'VALIDATION_ERROR', errors);
    this.name = 'ValidationError';
  }
}

export class ConflictError extends AppError {
  constructor(message = 'Data sudah ada.') {
    super(message, 409, 'CONFLICT');
    this.name = 'ConflictError';
  }
}

export class WorkflowError extends AppError {
  constructor(message: string) {
    super(message, 400, 'WORKFLOW_ERROR');
    this.name = 'WorkflowError';
  }
}

export class AccountingError extends AppError {
  constructor(message: string) {
    super(message, 400, 'ACCOUNTING_ERROR');
    this.name = 'AccountingError';
  }
}
