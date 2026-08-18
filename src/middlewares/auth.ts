import type { NextFunction, Request, Response } from 'express';
import { Errors } from '../utils/ApiError.js';
import { verifyAccessToken, type AccessTokenPayload } from '../utils/jwt.js';
import type { AccountType } from '../constants/index.js';
import { ACCOUNT_TYPES } from '../constants/index.js';
import { getRedis, cacheKeys } from '../config/redis.js';

declare global {
  namespace Express {
    interface Request {
      user?: AccessTokenPayload & { id: string };
    }
  }
}

export function authenticate(req: Request, _res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    next(Errors.unauthorized('Missing access token'));
    return;
  }

  try {
    const payload = verifyAccessToken(header.slice(7));
    req.user = { ...payload, id: payload.sub };
    next();
  } catch {
    next(Errors.unauthorized('Invalid or expired access token'));
  }
}

export function optionalAuth(req: Request, _res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    next();
    return;
  }
  try {
    const payload = verifyAccessToken(header.slice(7));
    req.user = { ...payload, id: payload.sub };
  } catch {
    // ignore
  }
  next();
}

export function authorize(...roles: AccountType[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      next(Errors.unauthorized());
      return;
    }
    if (!roles.includes(req.user.accountType)) {
      next(Errors.forbidden('Insufficient permissions'));
      return;
    }
    next();
  };
}

/** Office employees must pass MPIN gate after OTP login */
export async function requireMpinVerified(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  if (!req.user) {
    next(Errors.unauthorized());
    return;
  }

  if (req.user.accountType !== ACCOUNT_TYPES.OFFICE_EMPLOYEE) {
    next();
    return;
  }

  if (req.user.mpinVerified) {
    next();
    return;
  }

  const redis = getRedis();
  const ok = await redis.get(cacheKeys.mpinSession(req.user.id));
  if (!ok) {
    next(Errors.forbidden('MPIN verification required'));
    return;
  }
  next();
}
