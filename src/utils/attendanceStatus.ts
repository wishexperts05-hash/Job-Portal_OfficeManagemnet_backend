import { ATTENDANCE_STATUS } from '../constants/index.js';

/** Parse "HH:mm" to minutes from midnight. */
export function minutesFromHm(hm?: string | null): number | null {
  if (!hm || !/^([01]\d|2[0-3]):[0-5]\d$/.test(hm)) return null;
  const [h, m] = hm.split(':').map(Number);
  return h * 60 + m;
}

/** Scheduled shift length in minutes (default 8h if site times missing). */
export function shiftTotalMinutes(loginTime?: string | null, logoutTime?: string | null): number {
  const start = minutesFromHm(loginTime);
  const end = minutesFromHm(logoutTime);
  if (start == null || end == null) return 8 * 60;
  let diff = end - start;
  if (diff <= 0) diff += 24 * 60;
  return diff;
}

function clockMinutes(date: Date): number {
  return date.getHours() * 60 + date.getMinutes();
}

/**
 * Status after a completed login+logout:
 * - worked < half of shift → absent
 * - logout before site logout time → half_day (only if worked >= half)
 * - logout at/after site logout time → present
 * - no site logout time: present if worked >= full shift, else half_day (if >= half)
 */
export function resolveLogoutStatus(params: {
  loginAt: Date;
  logoutAt: Date;
  siteLoginTime?: string | null;
  siteLogoutTime?: string | null;
}): (typeof ATTENDANCE_STATUS)[keyof typeof ATTENDANCE_STATUS] {
  const workedMinutes = Math.max(
    0,
    Math.round((params.logoutAt.getTime() - params.loginAt.getTime()) / 60000),
  );
  const total = shiftTotalMinutes(params.siteLoginTime, params.siteLogoutTime);
  const half = total / 2;

  if (workedMinutes < half) {
    return ATTENDANCE_STATUS.ABSENT;
  }

  const siteLogout = minutesFromHm(params.siteLogoutTime);
  if (siteLogout == null) {
    return workedMinutes >= total ? ATTENDANCE_STATUS.PRESENT : ATTENDANCE_STATUS.HALF_DAY;
  }

  if (clockMinutes(params.logoutAt) >= siteLogout) {
    return ATTENDANCE_STATUS.PRESENT;
  }
  return ATTENDANCE_STATUS.HALF_DAY;
}
