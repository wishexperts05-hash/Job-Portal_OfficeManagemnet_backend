import { z } from 'zod';
import { Router } from 'express';
import { ACCOUNT_TYPES } from '../../constants/index.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { sendSuccess } from '../../utils/ApiResponse.js';
import { validate } from '../../middlewares/validate.js';
import { authenticate, authorize } from '../../middlewares/auth.js';
import { otpRateLimiter } from '../../middlewares/rateLimiter.js';
import * as authService from './auth.service.js';
import {
  employerProfileFieldsSchema,
  jobSeekerProfileFieldsSchema,
} from '../profile/profile.schemas.js';

const accountTypeSchema = z.enum([
  ACCOUNT_TYPES.EMPLOYER,
  ACCOUNT_TYPES.JOB_SEEKER,
  ACCOUNT_TYPES.OFFICE_EMPLOYEE,
]);

const router = Router();

router.post(
  '/otp/request',
  otpRateLimiter,
  validate(
    z.object({
      accountType: accountTypeSchema,
      mobile: z.string().min(10).max(15),
      intent: z.enum(['login', 'register']).optional().default('login'),
    }),
  ),
  asyncHandler(async (req, res) => {
    const data = await authService.requestOtp(
      req.body.accountType,
      req.body.mobile,
      req.body.intent,
    );
    sendSuccess(res, data, 'OTP sent');
  }),
);

router.post(
  '/otp/verify',
  validate(
    z.object({
      accountType: accountTypeSchema,
      mobile: z.string().min(10).max(15),
      otp: z.string().min(4).max(8),
    }),
  ),
  asyncHandler(async (req, res) => {
    const data = await authService.verifyOtpAndLogin(req.body);
    sendSuccess(res, data, 'Logged in');
  }),
);

router.post(
  '/admin/login',
  validate(
    z.object({
      email: z.string().email(),
      password: z.string().min(6),
    }),
  ),
  asyncHandler(async (req, res) => {
    const data = await authService.adminLogin(req.body.email, req.body.password);
    sendSuccess(res, data, 'Admin logged in');
  }),
);

router.post(
  '/register/employer',
  authenticate,
  authorize(ACCOUNT_TYPES.EMPLOYER),
  validate(
    employerProfileFieldsSchema.extend({
      preferredLocale: z.enum(['en', 'hi']).optional(),
    }),
  ),
  asyncHandler(async (req, res) => {
    const data = await authService.completeEmployerRegistration({
      userId: req.user!.id,
      ...req.body,
    });
    sendSuccess(res, data, 'Employer registration completed');
  }),
);

router.post(
  '/register/job-seeker',
  authenticate,
  authorize(ACCOUNT_TYPES.JOB_SEEKER),
  validate(
    jobSeekerProfileFieldsSchema.extend({
      preferredLocale: z.enum(['en', 'hi']).optional(),
    }),
  ),
  asyncHandler(async (req, res) => {
    const data = await authService.completeJobSeekerRegistration({
      userId: req.user!.id,
      ...req.body,
    });
    sendSuccess(res, data, 'Job seeker registration completed');
  }),
);

router.post(
  '/refresh',
  validate(z.object({ refreshToken: z.string().min(10) })),
  asyncHandler(async (req, res) => {
    const data = await authService.refreshSession(req.body.refreshToken);
    sendSuccess(res, data, 'Token refreshed');
  }),
);

router.post(
  '/logout',
  authenticate,
  asyncHandler(async (req, res) => {
    await authService.logout(req.user!.id, req.body?.refreshToken);
    sendSuccess(res, null, 'Logged out');
  }),
);

router.post(
  '/mpin/set',
  authenticate,
  authorize(ACCOUNT_TYPES.OFFICE_EMPLOYEE),
  validate(z.object({ mpin: z.string().length(4) })),
  asyncHandler(async (req, res) => {
    const data = await authService.setMpin(req.user!.id, req.body.mpin);
    sendSuccess(res, data, 'MPIN set');
  }),
);

router.post(
  '/mpin/verify',
  authenticate,
  authorize(ACCOUNT_TYPES.OFFICE_EMPLOYEE),
  validate(z.object({ mpin: z.string().length(4) })),
  asyncHandler(async (req, res) => {
    const data = await authService.verifyMpin(req.user!.id, req.body.mpin);
    sendSuccess(res, data, 'MPIN verified');
  }),
);

router.get(
  '/me',
  authenticate,
  asyncHandler(async (req, res) => {
    sendSuccess(res, { user: req.user }, 'OK');
  }),
);

export default router;
