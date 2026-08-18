import { PlatformSetting } from '../models/index.js';
import { getRedis, cacheKeys } from '../config/redis.js';

export async function getPlatformSettingsMap(): Promise<Record<string, unknown>> {
  const redis = getRedis();
  try {
    const cached = await redis.get(cacheKeys.settings);
    if (cached) return JSON.parse(cached) as Record<string, unknown>;
  } catch {
    // Redis optional — fall through to DB
  }

  const settings = await PlatformSetting.find().lean();
  const map = Object.fromEntries(settings.map((s) => [s.key, s.value]));
  try {
    await redis.set(cacheKeys.settings, JSON.stringify(map), 'EX', 300);
  } catch {
    // ignore cache write errors
  }
  return map;
}

export async function getSettingBool(key: string, defaultValue = true): Promise<boolean> {
  const map = await getPlatformSettingsMap();
  if (!(key in map)) return defaultValue;
  return Boolean(map[key]);
}
