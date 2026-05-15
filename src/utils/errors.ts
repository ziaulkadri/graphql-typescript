import { GraphQLError } from 'graphql';

export enum ErrorCode {
  UNAUTHENTICATED = 'UNAUTHENTICATED',
  FORBIDDEN = 'FORBIDDEN',
  NOT_FOUND = 'NOT_FOUND',
  BAD_USER_INPUT = 'BAD_USER_INPUT',
  CONFLICT = 'CONFLICT',
  INTERNAL_SERVER_ERROR = 'INTERNAL_SERVER_ERROR',
  RATE_LIMITED = 'RATE_LIMITED',
}

export class AppError extends GraphQLError {
  constructor(
    message: string,
    code: ErrorCode,
    statusCode = 400,
    extensions?: Record<string, unknown>
  ) {
    super(message, {
      extensions: {
        code,
        statusCode,
        ...extensions,
      },
    });
  }
}

export class AuthenticationError extends AppError {
  constructor(message = 'You must be logged in') {
    super(message, ErrorCode.UNAUTHENTICATED, 401);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'You do not have permission to perform this action') {
    super(message, ErrorCode.FORBIDDEN, 403);
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string) {
    super(`${resource} not found`, ErrorCode.NOT_FOUND, 404);
  }
}

export class ValidationError extends AppError {
  constructor(message: string, fields?: Record<string, string>) {
    super(message, ErrorCode.BAD_USER_INPUT, 400, { fields });
  }
}

export class ConflictError extends AppError {
  constructor(message: string) {
    super(message, ErrorCode.CONFLICT, 409);
  }
}

export function isAppError(err: unknown): err is AppError {
  return err instanceof AppError;
}
