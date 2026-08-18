import bcrypt from 'bcryptjs';
import { env } from '../../config/env.js';
import { getRedis, cacheKeys } from '../../config/redis.js';
import { ACCOUNT_TYPES, USER_STATUS, type AccountType } from '../../constants/index.js';
import { OTP_CONFIG } from '../../constants/config.js';
import {
  User,
  EmployerProfile,
  JobSeekerProfile,
  RegistrationLead,
  SubscriptionPlan,
  EmployerSubscription,
} from '../../models/index.js';
import { Errors } from '../../utils/ApiError.js';
import { generateOtp, sendOtpSms, storeOtp, verifyOtp } from '../../utils/otp.js';
import { normalizeMobile, isValidIndianMobile } from '../../utils/mobile.js';
import { assertMobileAvailableForRegistration } from '../../utils/portalMobile.js';
import { signAccessToken, signRefreshToken, verifyRefreshToken } from '../../utils/jwt.js';
import { LEAD_STATUS, SUBSCRIPTION_STATUS } from '../../constants/index.js';
import {
  pruneEmpty,
  type employerProfileFieldsSchema,
  type jobSeekerProfileFieldsSchema,
} from '../profile/profile.schemas.js';
import type { z } from 'zod';

type EmployerProfileFields = z.infer<typeof employerProfileFieldsSchema>;
type JobSeekerProfileFields = z.infer<typeof jobSeekerProfileFieldsSchema>;

const SALT_ROUNDS = 10;

async function issueTokens(
  userId: string,
  accountType: AccountType,
  opts?: { mobile?: string; email?: string; mpinVerified?: boolean },
) {
  const accessToken = signAccessToken({
    sub: userId,
    accountType,
    mobile: opts?.mobile,
    email: opts?.email,
    mpinVerified: opts?.mpinVerified ?? false,
  });

  const { token: refreshToken, jti } = signRefreshToken({
    sub: userId,
    accountType,
  });

  const redis = getRedis();
  // Store refresh jti for revocation (30d default mirrored loosely)
  await redis.set(cacheKeys.refresh(userId, jti), '1', 'EX', 60 * 60 * 24 * 30);

  return { accessToken, refreshToken };
}

export async function requestOtp(
  accountType: AccountType,
  mobileRaw: string,
  intent: 'login' | 'register' = 'login',
) {
  if (
    accountType !== ACCOUNT_TYPES.EMPLOYER &&
    accountType !== ACCOUNT_TYPES.JOB_SEEKER &&
    accountType !== ACCOUNT_TYPES.OFFICE_EMPLOYEE
  ) {
    throw Errors.badRequest('OTP login not supported for this account type');
  }

  const mobile = normalizeMobile(mobileRaw);
  if (!isValidIndianMobile(mobile)) {
    throw Errors.badRequest('Invalid mobile number');
  }

  if (
    intent === 'register' &&
    (accountType === ACCOUNT_TYPES.EMPLOYER || accountType === ACCOUNT_TYPES.JOB_SEEKER)
  ) {
    await assertMobileAvailableForRegistration(mobile, accountType);
  }

  if (accountType === ACCOUNT_TYPES.OFFICE_EMPLOYEE) {
    const user = await User.findOne({ mobile, accountType });
    if (!user || user.status !== USER_STATUS.ACTIVE) {
      throw Errors.notFound('Employee account not found. Ask employer to add you first.');
    }
  }

  const otp = generateOtp();
  await storeOtp(accountType, mobile, otp);
  await sendOtpSms(mobile, otp);

  return {
    mobile,
    expiresIn: OTP_CONFIG.EXPIRY_SECONDS,
    ...(OTP_CONFIG.PROVIDER === 'mock' ? { mockOtp: otp } : {}),
  };
}

export async function verifyOtpAndLogin(input: {
  accountType: AccountType;
  mobile: string;
  otp: string;
}) {
  const mobile = normalizeMobile(input.mobile);
  await verifyOtp(input.accountType, mobile, input.otp);

  let user = await User.findOne({ mobile, accountType: input.accountType });

  if (!user) {
    if (input.accountType === ACCOUNT_TYPES.OFFICE_EMPLOYEE) {
      throw Errors.notFound('Employee not registered');
    }
    // Pre-create shell user for registration completion flow
    user = await User.create({
      accountType: input.accountType,
      mobile,
      status: USER_STATUS.PENDING,
      preferredLocale: 'en',
    });
  }

  if (user.status === USER_STATUS.SUSPENDED) {
    throw Errors.forbidden('Account suspended');
  }

  user.lastLoginAt = new Date();
  await user.save();

  const tokens = await issueTokens(user.id, user.accountType, {
    mobile: user.mobile,
    mpinVerified: false,
  });

  return {
    user: {
      id: user.id,
      accountType: user.accountType,
      mobile: user.mobile,
      status: user.status,
      preferredLocale: user.preferredLocale,
      isMpinSet: user.isMpinSet,
      registrationPending: user.status === USER_STATUS.PENDING,
    },
    ...tokens,
    requiresMpin: user.accountType === ACCOUNT_TYPES.OFFICE_EMPLOYEE,
  };
}

export async function completeEmployerRegistration(
  input: EmployerProfileFields & { userId: string; preferredLocale?: 'en' | 'hi' },
) {
  const user = await User.findById(input.userId);
  if (!user || user.accountType !== ACCOUNT_TYPES.EMPLOYER) {
    throw Errors.forbidden('Employer account required');
  }

  const existing = await EmployerProfile.findOne({ userId: user._id });
  if (existing?.registrationCompleted) {
    throw Errors.conflict('Registration already completed');
  }

  const { userId: _userId, preferredLocale: _locale, ...rest } = input;
  const fields = pruneEmpty(rest);

  const profile =
    existing ??
    (await EmployerProfile.create({
      ...fields,
      userId: user._id,
      contactMobile: fields.contactMobile || user.mobile,
      isOfficeEnabled: true,
      registrationCompleted: true,
    }));

  if (existing) {
    Object.assign(profile, { ...fields, registrationCompleted: true });
    await profile.save();
  }

  user.status = USER_STATUS.ACTIVE;
  if (input.preferredLocale) user.preferredLocale = input.preferredLocale;
  await user.save();

  // Assign free launch plan
  const freePlan = await SubscriptionPlan.findOne({ code: 'FREE_LAUNCH', isActive: true });
  if (freePlan) {
    const hasSub = await EmployerSubscription.findOne({
      employerId: user._id,
      status: { $in: [SUBSCRIPTION_STATUS.ACTIVE, SUBSCRIPTION_STATUS.TRIAL] },
    });
    if (!hasSub) {
      await EmployerSubscription.create({
        employerId: user._id,
        employerProfileId: profile._id,
        planId: freePlan._id,
        status: SUBSCRIPTION_STATUS.ACTIVE,
        billingCycle: 'lifetime',
        startsAt: new Date(),
        amountPaid: 0,
      });
    }
  }

  if (user.mobile) {
    await RegistrationLead.updateMany(
      {
        mobile: user.mobile,
        accountType: ACCOUNT_TYPES.EMPLOYER,
        status: { $in: [LEAD_STATUS.IN_PROGRESS, LEAD_STATUS.ABANDONED] },
      },
      {
        $set: {
          status: LEAD_STATUS.CONVERTED,
          convertedUserId: user._id,
          progressPercent: 100,
        },
      },
    );
  }

  return { user, profile };
}

export async function completeJobSeekerRegistration(
  input: JobSeekerProfileFields & { userId: string; preferredLocale?: 'en' | 'hi' },
) {
  const user = await User.findById(input.userId);
  if (!user || user.accountType !== ACCOUNT_TYPES.JOB_SEEKER) {
    throw Errors.forbidden('Job seeker account required');
  }

  let profile = await JobSeekerProfile.findOne({ userId: user._id });
  if (profile?.registrationCompleted) {
    throw Errors.conflict('Registration already completed');
  }

  const { userId: _userId, preferredLocale: _locale, ...rest } = input;
  const fields = {
    ...pruneEmpty(rest),
    skills: rest.skills ?? [],
    languages: rest.languages ?? [],
    education: rest.education ?? [],
    experience: rest.experience ?? [],
    preferredCities: rest.preferredCities ?? [],
    experienceYears: rest.experienceYears ?? 0,
  };

  if (!profile) {
    profile = await JobSeekerProfile.create({
      ...fields,
      userId: user._id,
      registrationCompleted: true,
    });
  } else {
    Object.assign(profile, { ...fields, registrationCompleted: true });
    await profile.save();
  }

  user.status = USER_STATUS.ACTIVE;
  if (input.preferredLocale) user.preferredLocale = input.preferredLocale;
  await user.save();

  if (user.mobile) {
    await RegistrationLead.updateMany(
      {
        mobile: user.mobile,
        accountType: ACCOUNT_TYPES.JOB_SEEKER,
        status: { $in: [LEAD_STATUS.IN_PROGRESS, LEAD_STATUS.ABANDONED] },
      },
      {
        $set: {
          status: LEAD_STATUS.CONVERTED,
          convertedUserId: user._id,
          progressPercent: 100,
        },
      },
    );
  }

  return { user, profile };
}

export async function adminLogin(email: string, password: string) {
  const user = await User.findOne({
    email: email.toLowerCase(),
    accountType: ACCOUNT_TYPES.ADMIN,
  }).select('+passwordHash');

  if (!user?.passwordHash) {
    throw Errors.unauthorized('Invalid credentials');
  }

  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) throw Errors.unauthorized('Invalid credentials');

  if (user.status !== USER_STATUS.ACTIVE) {
    throw Errors.forbidden('Admin account inactive');
  }

  user.lastLoginAt = new Date();
  await user.save();

  const tokens = await issueTokens(user.id, user.accountType, { email: user.email });
  return {
    user: {
      id: user.id,
      accountType: user.accountType,
      email: user.email,
      status: user.status,
    },
    ...tokens,
  };
}

export async function refreshSession(refreshToken: string) {
  let payload;
  try {
    payload = verifyRefreshToken(refreshToken);
  } catch {
    throw Errors.unauthorized('Invalid refresh token');
  }

  const redis = getRedis();
  const exists = await redis.get(cacheKeys.refresh(payload.sub, payload.jti));
  if (!exists) throw Errors.unauthorized('Refresh token revoked');

  const user = await User.findById(payload.sub);
  if (!user || user.status === USER_STATUS.SUSPENDED) {
    throw Errors.unauthorized('User not allowed');
  }

  // rotate
  await redis.del(cacheKeys.refresh(payload.sub, payload.jti));

  return issueTokens(user.id, user.accountType, {
    mobile: user.mobile,
    email: user.email,
    mpinVerified: false,
  });
}

export async function logout(userId: string, refreshToken?: string) {
  const redis = getRedis();
  if (refreshToken) {
    try {
      const payload = verifyRefreshToken(refreshToken);
      await redis.del(cacheKeys.refresh(userId, payload.jti));
    } catch {
      // ignore
    }
  }
  await redis.del(cacheKeys.mpinSession(userId));
}

export async function setMpin(userId: string, mpin: string) {
  if (!/^\d{4}$/.test(mpin)) {
    throw Errors.badRequest('MPIN must be 4 digits');
  }

  const user = await User.findById(userId);
  if (!user || user.accountType !== ACCOUNT_TYPES.OFFICE_EMPLOYEE) {
    throw Errors.forbidden('Only office employees can set MPIN');
  }

  user.mpinHash = await bcrypt.hash(mpin, SALT_ROUNDS);
  user.isMpinSet = true;
  await user.save();

  const redis = getRedis();
  // Parse rough hours from env like "12h"
  const hours = Number(String(env.MPIN_SESSION_EXPIRES_IN).replace(/\D/g, '')) || 12;
  await redis.set(cacheKeys.mpinSession(userId), '1', 'EX', hours * 3600);

  const accessToken = signAccessToken({
    sub: user.id,
    accountType: user.accountType,
    mobile: user.mobile,
    mpinVerified: true,
  });

  return { accessToken, isMpinSet: true };
}

export async function verifyMpin(userId: string, mpin: string) {
  const user = await User.findById(userId).select('+mpinHash');
  if (!user || user.accountType !== ACCOUNT_TYPES.OFFICE_EMPLOYEE) {
    throw Errors.forbidden();
  }
  if (!user.isMpinSet || !user.mpinHash) {
    throw Errors.badRequest('MPIN not set. Please set MPIN first.');
  }

  const ok = await bcrypt.compare(mpin, user.mpinHash);
  if (!ok) throw Errors.unauthorized('Invalid MPIN');

  const redis = getRedis();
  const hours = Number(String(env.MPIN_SESSION_EXPIRES_IN).replace(/\D/g, '')) || 12;
  await redis.set(cacheKeys.mpinSession(userId), '1', 'EX', hours * 3600);

  const accessToken = signAccessToken({
    sub: user.id,
    accountType: user.accountType,
    mobile: user.mobile,
    mpinVerified: true,
  });

  return { accessToken };
}

export async function hashPassword(password: string) {
  return bcrypt.hash(password, SALT_ROUNDS);
}
