export class ApiError extends Error {
  statusCode: number;
  code: string;
  details?: unknown;
  isOperational: boolean;

  constructor(statusCode: number, message: string, code = 'ERROR', details?: unknown) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    this.isOperational = true;
    Error.captureStackTrace?.(this, this.constructor);
  }
}

export const Errors = {
  badRequest: (message: string, details?: unknown) =>
    new ApiError(400, message, 'BAD_REQUEST', details),
  unauthorized: (message = 'Unauthorized') => new ApiError(401, message, 'UNAUTHORIZED'),
  forbidden: (message = 'Forbidden') => new ApiError(403, message, 'FORBIDDEN'),
  notFound: (message = 'Not found') => new ApiError(404, message, 'NOT_FOUND'),
  conflict: (message: string) => new ApiError(409, message, 'CONFLICT'),
  tooMany: (message = 'Too many requests') => new ApiError(429, message, 'RATE_LIMIT'),
  internal: (message = 'Internal server error') => new ApiError(500, message, 'INTERNAL'),
};
