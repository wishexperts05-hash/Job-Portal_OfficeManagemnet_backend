import crypto from 'crypto';
import { getRedis, cacheKeys } from '../config/redis.ts';
import { OTP_CONFIG } from '../constants/config.ts';
import { Errors } from './ApiError.ts';

export function generateOtp(): string {
  if (OTP_CONFIG.PROVIDER === 'mock') {
    return OTP_CONFIG.MOCK_OTP;
  }
  const max = 10 ** OTP_CONFIG.LENGTH;
  const num = crypto.randomInt(0, max);
  return String(num).padStart(OTP_CONFIG.LENGTH, '0');
}

export async function storeOtp(accountType: string, mobile: string, otp: string): Promise<void> {
  const redis = getRedis();
  const key = cacheKeys.otp(accountType, mobile);
  const cooldownKey = cacheKeys.otpCooldown(accountType, mobile);

  const cool = await redis.get(cooldownKey);
  if (cool) {
    throw Errors.tooMany('Please wait before requesting another OTP');
  }

  await redis.set(key, otp, 'EX', OTP_CONFIG.EXPIRY_SECONDS);
  await redis.set(cooldownKey, '1', 'EX', OTP_CONFIG.COOLDOWN_SECONDS);
}

export async function verifyOtp(accountType: string, mobile: string, otp: string): Promise<void> {
  const redis = getRedis();
  const key = cacheKeys.otp(accountType, mobile);
  const stored = await redis.get(key);

  if (!stored) {
    throw Errors.badRequest('OTP expired or not requested');
  }

  if (stored !== otp) {
    throw Errors.badRequest('Invalid OTP');
  }

  await redis.del(key);
}

/** Mock SMS sender — swap with MSG91/Twilio later when OTP_CONFIG.PROVIDER changes */
export async function sendOtpSms(mobile: string, otp: string): Promise<void> {
  if (OTP_CONFIG.PROVIDER === 'mock') {
    console.log(`[otp:mock] mobile=${mobile} otp=${otp}`);
    return;
  }
  console.log(`[otp] sending to ${mobile}`);
}
