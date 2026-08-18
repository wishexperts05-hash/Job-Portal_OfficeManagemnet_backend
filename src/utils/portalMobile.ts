import { ACCOUNT_TYPES, USER_STATUS, type AccountType } from '../constants/index.ts';
import { User } from '../models/index.ts';
import { ApiError } from './ApiError.ts';

const PORTAL_ACCOUNT_TYPES = [ACCOUNT_TYPES.EMPLOYER, ACCOUNT_TYPES.JOB_SEEKER] as const;

function mobileAlreadyRegisteredError(message: string) {
  return new ApiError(409, message, 'MOBILE_ALREADY_REGISTERED');
}

/**
 * Registration OTP: reject only if this mobile is already registered
 * for the same account type (employer ↔ job seeker can share a mobile).
 */
export async function assertMobileAvailableForRegistration(
  mobile: string,
  accountType: AccountType,
): Promise<void> {
  if (!PORTAL_ACCOUNT_TYPES.includes(accountType as (typeof PORTAL_ACCOUNT_TYPES)[number])) {
    return;
  }

  const existing = await User.findOne({ mobile, accountType });
  if (existing?.status === USER_STATUS.ACTIVE) {
    throw mobileAlreadyRegisteredError(
      'This mobile number is already registered. Please login instead.',
    );
  }
}
