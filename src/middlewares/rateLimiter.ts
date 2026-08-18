import rateLimit from 'express-rate-limit';
import { RATE_LIMIT_CONFIG } from '../constants/config.js';

export const globalRateLimiter = rateLimit({
  windowMs: RATE_LIMIT_CONFIG.WINDOW_MS,
  max: RATE_LIMIT_CONFIG.MAX,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many requests', code: 'RATE_LIMIT' },
});

export const otpRateLimiter = rateLimit({
  windowMs: RATE_LIMIT_CONFIG.OTP_WINDOW_MS,
  max: RATE_LIMIT_CONFIG.OTP_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many OTP requests', code: 'RATE_LIMIT' },
});
