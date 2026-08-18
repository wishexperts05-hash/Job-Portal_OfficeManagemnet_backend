import { z } from 'zod';
import { Router } from 'express';
import { CompanySite, EmployerProfile, OfficeEmployee } from '../../models/index.ts';
import { ACCOUNT_TYPES, USER_STATUS } from '../../constants/index.ts';
import { asyncHandler } from '../../utils/asyncHandler.ts';
import { sendSuccess, sendCreated } from '../../utils/ApiResponse.ts';
import { validate } from '../../middlewares/validate.ts';
import { authenticate, authorize, requireMpinVerified } from '../../middlewares/auth.ts';
import { Errors } from '../../utils/ApiError.ts';

const router = Router();

const hhmm = /^([01]\d|2[0-3]):[0-5]\d$/;
const timeHm = z
  .string()
  .optional()
  .refine((v) => v == null || v === '' || hhmm.test(v), { message: 'Use HH:mm format' })
  .transform((v) => (v && v.trim() ? v.trim() : undefined));

const siteBodySchema = z.object({
  name: z.string().min(2),
  nameHi: z.string().optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  pincode: z.string().optional(),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  geofenceRadiusMeters: z.number().min(20).max(5000).optional(),
  loginTime: timeHm,
  logoutTime: timeHm,
  isPrimary: z.boolean().optional(),
});

const sitePatchSchema = z.object({
  name: z.string().min(2).optional(),
  nameHi: z.string().optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  pincode: z.string().optional(),
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
  geofenceRadiusMeters: z.number().min(20).max(5000).optional(),
  loginTime: timeHm,
  logoutTime: timeHm,
  isPrimary: z.boolean().optional(),
  isActive: z.boolean().optional(),
});

router.get(
  '/',
  authenticate,
  authorize(ACCOUNT_TYPES.EMPLOYER, ACCOUNT_TYPES.OFFICE_EMPLOYEE),
  requireMpinVerified,
  asyncHandler(async (req, res) => {
    let employerId = req.user!.id;

    if (req.user!.accountType === ACCOUNT_TYPES.OFFICE_EMPLOYEE) {
      employerId = String(req.query.employerId || '');
      if (!employerId) throw Errors.badRequest('employerId required');
      const membership = await OfficeEmployee.findOne({
        userId: req.user!.id,
        employerId,
        status: USER_STATUS.ACTIVE,
      });
      if (!membership) throw Errors.forbidden();
    }

    const sites = await CompanySite.find({
      employerId,
      isActive: true,
    }).sort({ isPrimary: -1, createdAt: -1 });
    sendSuccess(res, sites, 'Sites');
  }),
);

router.get(
  '/:id',
  authenticate,
  authorize(ACCOUNT_TYPES.EMPLOYER, ACCOUNT_TYPES.OFFICE_EMPLOYEE),
  requireMpinVerified,
  asyncHandler(async (req, res) => {
    let employerId = req.user!.id;

    if (req.user!.accountType === ACCOUNT_TYPES.OFFICE_EMPLOYEE) {
      employerId = String(req.query.employerId || '');
      if (!employerId) throw Errors.badRequest('employerId required');
      const membership = await OfficeEmployee.findOne({
        userId: req.user!.id,
        employerId,
        status: USER_STATUS.ACTIVE,
      });
      if (!membership) throw Errors.forbidden();
    }

    const site = await CompanySite.findOne({
      _id: req.params.id,
      employerId,
      isActive: true,
    });
    if (!site) throw Errors.notFound('Site not found');
    sendSuccess(res, site, 'Site');
  }),
);

router.post(
  '/',
  authenticate,
  authorize(ACCOUNT_TYPES.EMPLOYER),
  validate(siteBodySchema),
  asyncHandler(async (req, res) => {
    const profile = await EmployerProfile.findOne({ userId: req.user!.id });
    if (!profile) throw Errors.forbidden('Employer profile required');

    if (req.body.isPrimary) {
      await CompanySite.updateMany(
        { employerId: req.user!.id },
        { $set: { isPrimary: false } },
      );
    }

    const site = await CompanySite.create({
      employerId: req.user!.id,
      employerProfileId: profile._id,
      name: req.body.name,
      nameHi: req.body.nameHi,
      address: req.body.address,
      city: req.body.city,
      state: req.body.state,
      pincode: req.body.pincode,
      location: { type: 'Point', coordinates: [req.body.lng, req.body.lat] },
      geofenceRadiusMeters: req.body.geofenceRadiusMeters ?? 150,
      loginTime: req.body.loginTime,
      logoutTime: req.body.logoutTime,
      isPrimary: req.body.isPrimary ?? false,
    });

    sendCreated(res, site, 'Site created');
  }),
);

router.patch(
  '/:id',
  authenticate,
  authorize(ACCOUNT_TYPES.EMPLOYER),
  validate(sitePatchSchema),
  asyncHandler(async (req, res) => {
    const site = await CompanySite.findOne({ _id: req.params.id, employerId: req.user!.id });
    if (!site) throw Errors.notFound('Site not found');

    const { lat, lng, isPrimary, loginTime, logoutTime, ...rest } = req.body;
    Object.assign(site, rest);

    if (loginTime !== undefined) site.loginTime = loginTime || undefined;
    if (logoutTime !== undefined) site.logoutTime = logoutTime || undefined;

    if (typeof lat === 'number' && typeof lng === 'number') {
      site.location = { type: 'Point', coordinates: [lng, lat] };
    }

    if (isPrimary) {
      await CompanySite.updateMany(
        { employerId: req.user!.id, _id: { $ne: site._id } },
        { $set: { isPrimary: false } },
      );
      site.isPrimary = true;
    } else if (isPrimary === false) {
      site.isPrimary = false;
    }

    await site.save();
    sendSuccess(res, site, 'Site updated');
  }),
);

export default router;
