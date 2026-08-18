import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import { env } from '../config/env.js';
import type { AccountType } from '../constants/index.js';

export interface AccessTokenPayload {
  sub: string;
  accountType: AccountType;
  mobile?: string;
  email?: string;
  mpinVerified?: boolean;
}

export interface RefreshTokenPayload {
  sub: string;
  jti: string;
  accountType: AccountType;
}

export function signAccessToken(payload: AccessTokenPayload): string {
  return jwt.sign(payload, env.JWT_ACCESS_SECRET, {
    expiresIn: env.JWT_ACCESS_EXPIRES_IN as jwt.SignOptions['expiresIn'],
  });
}

export function signRefreshToken(payload: Omit<RefreshTokenPayload, 'jti'> & { jti?: string }): {
  token: string;
  jti: string;
} {
  const jti = payload.jti ?? uuidv4();
  const token = jwt.sign(
    { sub: payload.sub, accountType: payload.accountType, jti },
    env.JWT_REFRESH_SECRET,
    { expiresIn: env.JWT_REFRESH_EXPIRES_IN as jwt.SignOptions['expiresIn'] },
  );
  return { token, jti };
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  return jwt.verify(token, env.JWT_ACCESS_SECRET) as AccessTokenPayload;
}

export function verifyRefreshToken(token: string): RefreshTokenPayload {
  return jwt.verify(token, env.JWT_REFRESH_SECRET) as RefreshTokenPayload;
}
