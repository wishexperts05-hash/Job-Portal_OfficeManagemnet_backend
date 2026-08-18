/** App-level defaults — not read from .env */

export const OTP_CONFIG = {
  PROVIDER: 'mock' as 'mock' | 'msg91' | 'twilio',
  LENGTH: 6,
  EXPIRY_SECONDS: 300,
  COOLDOWN_SECONDS: 30,
  MOCK_OTP: '123456',
} as const;

export const RATE_LIMIT_CONFIG = {
  WINDOW_MS: 15 * 60 * 1000, // 15 minutes
  MAX: 300,
  OTP_WINDOW_MS: 15 * 60 * 1000,
  OTP_MAX: 5,
} as const;

export const EMAIL_CONFIG = {
  /** Gmail SMTP via nodemailer */
  PROVIDER: 'smtp' as 'mock' | 'smtp',
  SMTP_HOST: 'smtp.gmail.com',
  SMTP_PORT: 587,
  SMTP_SECURE: false,
} as const;

export const PUSH_CONFIG = {
  /** Firebase Cloud Messaging */
  PROVIDER: 'firebase' as 'mock' | 'firebase',
} as const;

export const PAYMENT_CONFIG = {
  PROVIDER: 'razorpay' as 'mock' | 'razorpay',
} as const;
