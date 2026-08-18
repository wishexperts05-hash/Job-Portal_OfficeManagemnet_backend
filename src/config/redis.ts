import { Redis } from 'ioredis';
import { env } from './env.js';

let redis: Redis | null = null;

export function getRedis(): Redis {
  if (!redis) {
    if (env.REDIS_URL) {
      const useTls = env.REDIS_URL.startsWith('rediss://') || env.REDIS_TLS;
      redis = new Redis(env.REDIS_URL, {
        maxRetriesPerRequest: 3,
        enableReadyCheck: true,
        tls: useTls ? { rejectUnauthorized: false } : undefined,
      });
    } else {
      redis = new Redis({
        host: env.REDIS_HOST,
        port: env.REDIS_PORT,
        username: env.REDIS_USERNAME || undefined,
        password: env.REDIS_PASSWORD || undefined,
        maxRetriesPerRequest: 3,
        enableReadyCheck: true,
        // Only enable TLS when explicitly requested — auto-TLS causes
        // "wrong version number" against plain Redis Cloud ports.
        tls: env.REDIS_TLS ? { rejectUnauthorized: false } : undefined,
      });
    }

    redis.on('connect', () => console.log('[redis] connected'));
    redis.on('ready', () => console.log('[redis] ready'));
    redis.on('error', (err: Error) => console.error('[redis] error', err.message));
  }
  return redis;
}

export async function disconnectRedis(): Promise<void> {
  if (redis) {
    await redis.quit();
    redis = null;
  }
}

export const cacheKeys = {
  otp: (accountType: string, mobile: string) => `otp:${accountType}:${mobile}`,
  otpCooldown: (accountType: string, mobile: string) => `otp:cd:${accountType}:${mobile}`,
  refresh: (userId: string, jti: string) => `refresh:${userId}:${jti}`,
  mpinSession: (userId: string) => `mpin:session:${userId}`,
  jobList: (hash: string) => `jobs:list:${hash}`,
  settings: 'platform:settings',
  categories: 'jobs:categories:tree',
};
