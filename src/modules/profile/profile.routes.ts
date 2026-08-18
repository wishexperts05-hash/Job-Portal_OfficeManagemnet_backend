import { Router } from 'express';
import { ACCOUNT_TYPES } from '../../constants/index.ts';
import { EmployerProfile, JobSeekerProfile, User } from '../../models/index.ts';
import { authenticate, authorize } from '../../middlewares/auth.ts';
import { validate } from '../../middlewares/validate.ts';
import { asyncHandler } from '../../utils/asyncHandler.ts';
import { sendSuccess } from '../../utils/ApiResponse.ts';
import { Errors } from '../../utils/ApiError.ts';
import {
  employerProfileFieldsSchema,
  jobSeekerProfileFieldsSchema,
  pruneEmpty,
} from './profile.schemas.ts';

const router = Router();

router.get(
  '/me',
  authenticate,
  asyncHandler(async (req, res) => {
    const userId = req.user!.id;
    const user = await User.findById(userId).select('-passwordHash -mpinHash').lean();
    if (!user) throw Errors.notFound('User not found');

    const profile =
      user.accountType === ACCOUNT_TYPES.EMPLOYER
        ? await EmployerProfile.findOne({ userId }).lean()
        : await JobSeekerProfile.findOne({ userId }).lean();

    sendSuccess(res, { user, profile }, 'OK');
  }),
);

router.patch(
  '/employer',
  authenticate,
  authorize(ACCOUNT_TYPES.EMPLOYER),
  validate(employerProfileFieldsSchema.partial()),
  asyncHandler(async (req, res) => {
    const profile = await EmployerProfile.findOneAndUpdate(
      { userId: req.user!.id },
      { $set: pruneEmpty(req.body) },
      { new: true },
    );
    if (!profile) throw Errors.notFound('Employer profile not found');
    sendSuccess(res, profile, 'Profile updated');
  }),
);

router.patch(
  '/job-seeker',
  authenticate,
  authorize(ACCOUNT_TYPES.JOB_SEEKER),
  validate(jobSeekerProfileFieldsSchema.partial()),
  asyncHandler(async (req, res) => {
    const body = req.body as Record<string, unknown>;
    const update = pruneEmpty(body);

    // Arrays are replaced wholesale so the client can remove entries.
    for (const key of [
      'skills',
      'languages',
      'education',
      'experience',
      'preferredCities',
    ] as const) {
      if (Array.isArray(body[key])) update[key] = body[key];
    }

    const profile = await JobSeekerProfile.findOneAndUpdate(
      { userId: req.user!.id },
      { $set: update },
      { new: true },
    );
    if (!profile) throw Errors.notFound('Job seeker profile not found');
    sendSuccess(res, profile, 'Profile updated');
  }),
);

export default router;
