import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

/** Strip wrapping quotes / trailing commas from .env values */
function cleanEnvValue(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  let v = value.trim();
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
    v = v.slice(1, -1);
  }
  if (v.endsWith(',')) v = v.slice(0, -1).trim();
  return v;
}

for (const key of Object.keys(process.env)) {
  process.env[key] = cleanEnvValue(process.env[key]) as string;
}

const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().default(5000),
    API_PREFIX: z.string().default('/api/v1'),
    MONGODB_URI: z.string().min(1),

    REDIS_URL: z.string().optional().default(''),
    REDIS_HOST: z.string().optional().default(''),
    REDIS_PORT: z.coerce.number().optional().default(6379),
    REDIS_USERNAME: z.string().optional().default(''),
    REDIS_PASSWORD: z.string().optional().default(''),
    /** Set true only if Redis endpoint requires TLS (rediss). Wrong-version SSL errors mean keep this false. */
    REDIS_TLS: z
      .union([z.boolean(), z.string()])
      .optional()
      .default('false')
      .transform((v) => v === true || v === 'true' || v === '1'),

    JWT_ACCESS_SECRET: z.string().min(16),
    JWT_REFRESH_SECRET: z.string().min(16),
    JWT_ACCESS_EXPIRES_IN: z.string().default('15m'),
    JWT_REFRESH_EXPIRES_IN: z.string().default('30d'),
    MPIN_SESSION_EXPIRES_IN: z.string().default('12h'),

    CLOUDINARY_CLOUD_NAME: z.string().optional().default(''),
    CLOUDINARY_API_KEY: z.string().optional().default(''),
    CLOUDINARY_API_SECRET: z.string().optional().default(''),
    GOOGLE_MAPS_API_KEY: z.string().optional().default(''),

    // Gmail SMTP credentials
    SMTP_USER: z.string().optional().default(''),
    SMTP_PASS: z.string().optional().default(''),
    EMAIL_FROM: z.string().optional().default(''),

    // Firebase Admin SDK
    FIREBASE_PROJECT_ID: z.string().optional().default(''),
    FIREBASE_CLIENT_EMAIL: z.string().optional().default(''),
    FIREBASE_PRIVATE_KEY: z.string().optional().default(''),

    // Razorpay keys (provider mode is in constants)
    RAZORPAY_KEY_ID: z.string().optional().default(''),
    RAZORPAY_KEY_SECRET: z.string().optional().default(''),
    RAZORPAY_WEBHOOK_SECRET: z.string().optional().default(''),

    ADMIN_EMAIL: z.string().email(),
    ADMIN_PASSWORD: z.string().min(6),
    ADMIN_NAME: z.string().default('Platform Admin'),
    CORS_ORIGINS: z.string().default('http://localhost:3000'),
  })
  .superRefine((val, ctx) => {
    if (!val.REDIS_URL && !val.REDIS_HOST) {
      ctx.addIssue({
        code: 'custom',
        message: 'Provide REDIS_URL or REDIS_HOST',
        path: ['REDIS_URL'],
      });
    }
  });

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('Invalid environment variables:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = {
  ...parsed.data,
  FIREBASE_PRIVATE_KEY: parsed.data.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
  EMAIL_FROM: parsed.data.EMAIL_FROM || parsed.data.SMTP_USER || 'noreply@textilejobs.local',
};

export const corsOrigins = env.CORS_ORIGINS.split(',').map((o) => o.trim()).filter(Boolean);
