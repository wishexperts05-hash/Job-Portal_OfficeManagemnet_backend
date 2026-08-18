import { z } from 'zod';
import { Router } from 'express';
import dayjs from 'dayjs';
import {
  Attendance,
  CompanySite,
  OfficeEmployee,
  EmployerProfile,
} from '../../models/index.js';
import { ACCOUNT_TYPES, ATTENDANCE_STATUS, USER_STATUS } from '../../constants/index.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { sendSuccess, sendCreated } from '../../utils/ApiResponse.js';
import { validate } from '../../middlewares/validate.js';
import { authenticate, authorize, requireMpinVerified } from '../../middlewares/auth.js';
import { Errors } from '../../utils/ApiError.js';
import { isWithinGeofence } from '../../utils/geo.js';
import { getPagination, paginationMeta } from '../../utils/pagination.js';
import { resolveLogoutStatus } from '../../utils/attendanceStatus.js';

const router = Router();

const statusEnum = z.enum([
  ATTENDANCE_STATUS.PRESENT,
  ATTENDANCE_STATUS.ABSENT,
  ATTENDANCE_STATUS.HALF_DAY,
  ATTENDANCE_STATUS.ON_LEAVE,
]);

/** Past days with login but no logout → absent (employer can still override later). */
async function finalizeMissingLogouts(filter: Record<string, unknown>) {
  const today = dayjs().format('YYYY-MM-DD');
  await Attendance.updateMany(
    {
      ...filter,
      date: { $lt: today },
      loginAt: { $ne: null },
      $or: [{ logoutAt: null }, { logoutAt: { $exists: false } }],
      status: { $nin: [ATTENDANCE_STATUS.ON_LEAVE] },
    },
    { $set: { status: ATTENDANCE_STATUS.ABSENT, workedMinutes: 0 } },
  );
}

router.post(
  '/login',
  authenticate,
  authorize(ACCOUNT_TYPES.OFFICE_EMPLOYEE),
  requireMpinVerified,
  validate(
    z.object({
      employerId: z.string(),
      siteId: z.string(),
      lat: z.number(),
      lng: z.number(),
    }),
  ),
  asyncHandler(async (req, res) => {
    const membership = await OfficeEmployee.findOne({
      userId: req.user!.id,
      employerId: req.body.employerId,
      status: USER_STATUS.ACTIVE,
    });
    if (!membership) throw Errors.forbidden('Not associated with this employer');

    const site = await CompanySite.findOne({
      _id: req.body.siteId,
      employerId: req.body.employerId,
      isActive: true,
    });
    if (!site) throw Errors.notFound('Site not found');

    const [siteLng, siteLat] = site.location.coordinates;
    if (
      !isWithinGeofence(
        req.body.lat,
        req.body.lng,
        siteLat,
        siteLng,
        site.geofenceRadiusMeters,
      )
    ) {
      throw Errors.forbidden('You are outside the allowed attendance geofence');
    }

    const date = dayjs().format('YYYY-MM-DD');
    const existing = await Attendance.findOne({ employeeId: membership._id, date });
    if (existing?.status === ATTENDANCE_STATUS.ON_LEAVE) {
      throw Errors.conflict('Already marked on leave for today');
    }
    if (existing?.loginAt) {
      throw Errors.conflict('Already logged in for today');
    }

    const profile = await EmployerProfile.findOne({ userId: req.body.employerId });
    if (!profile) throw Errors.notFound('Employer profile missing');

    // Until logout is marked, day is treated as absent for payroll.
    const attendance =
      existing ??
      (await Attendance.create({
        employerId: req.body.employerId,
        employerProfileId: profile._id,
        employeeId: membership._id,
        userId: req.user!.id,
        siteId: site._id,
        date,
        status: ATTENDANCE_STATUS.ABSENT,
      }));

    attendance.loginAt = new Date();
    attendance.loginLocation = { type: 'Point', coordinates: [req.body.lng, req.body.lat] };
    attendance.siteId = site._id;
    attendance.logoutAt = undefined;
    attendance.workedMinutes = 0;
    attendance.status = ATTENDANCE_STATUS.ABSENT;
    await attendance.save();

    sendSuccess(res, attendance, 'Attendance login recorded');
  }),
);

router.post(
  '/leave',
  authenticate,
  authorize(ACCOUNT_TYPES.OFFICE_EMPLOYEE),
  requireMpinVerified,
  validate(
    z.object({
      employerId: z.string(),
      siteId: z.string().optional(),
      notes: z.string().max(500).optional(),
    }),
  ),
  asyncHandler(async (req, res) => {
    const membership = await OfficeEmployee.findOne({
      userId: req.user!.id,
      employerId: req.body.employerId,
      status: USER_STATUS.ACTIVE,
    });
    if (!membership) throw Errors.forbidden('Not associated with this employer');

    const profile = await EmployerProfile.findOne({ userId: req.body.employerId });
    if (!profile) throw Errors.notFound('Employer profile missing');

    let site = req.body.siteId
      ? await CompanySite.findOne({
          _id: req.body.siteId,
          employerId: req.body.employerId,
          isActive: true,
        })
      : null;

    if (!site) {
      site = await CompanySite.findOne({
        employerId: req.body.employerId,
        isActive: true,
      }).sort({ isPrimary: -1, createdAt: 1 });
    }
    if (!site) throw Errors.badRequest('No site configured for this company');

    const date = dayjs().format('YYYY-MM-DD');
    const existing = await Attendance.findOne({ employeeId: membership._id, date });
    if (existing?.status === ATTENDANCE_STATUS.ON_LEAVE) {
      throw Errors.conflict('Already marked on leave for today');
    }
    if (existing?.loginAt) {
      throw Errors.conflict('Cannot mark leave after login for today');
    }

    const attendance =
      existing ??
      (await Attendance.create({
        employerId: req.body.employerId,
        employerProfileId: profile._id,
        employeeId: membership._id,
        userId: req.user!.id,
        siteId: site._id,
        date,
        status: ATTENDANCE_STATUS.ON_LEAVE,
      }));

    attendance.status = ATTENDANCE_STATUS.ON_LEAVE;
    attendance.siteId = site._id;
    if (req.body.notes) attendance.notes = req.body.notes;
    attendance.loginAt = undefined;
    attendance.logoutAt = undefined;
    attendance.workedMinutes = 0;
    await attendance.save();

    sendSuccess(res, attendance, 'Leave recorded for today');
  }),
);

router.post(
  '/logout',
  authenticate,
  authorize(ACCOUNT_TYPES.OFFICE_EMPLOYEE),
  requireMpinVerified,
  validate(
    z.object({
      employerId: z.string(),
      siteId: z.string(),
      lat: z.number(),
      lng: z.number(),
    }),
  ),
  asyncHandler(async (req, res) => {
    const membership = await OfficeEmployee.findOne({
      userId: req.user!.id,
      employerId: req.body.employerId,
      status: USER_STATUS.ACTIVE,
    });
    if (!membership) throw Errors.forbidden();

    const site = await CompanySite.findOne({
      _id: req.body.siteId,
      employerId: req.body.employerId,
      isActive: true,
    });
    if (!site) throw Errors.notFound('Site not found');

    const [siteLng, siteLat] = site.location.coordinates;
    if (
      !isWithinGeofence(
        req.body.lat,
        req.body.lng,
        siteLat,
        siteLng,
        site.geofenceRadiusMeters,
      )
    ) {
      throw Errors.forbidden('You are outside the allowed attendance geofence');
    }

    const date = dayjs().format('YYYY-MM-DD');
    const attendance = await Attendance.findOne({ employeeId: membership._id, date });
    if (attendance?.status === ATTENDANCE_STATUS.ON_LEAVE) {
      throw Errors.conflict('On leave for today');
    }
    if (!attendance?.loginAt) throw Errors.badRequest('No login found for today');
    if (attendance.logoutAt) throw Errors.conflict('Already logged out');

    attendance.logoutAt = new Date();
    attendance.logoutLocation = { type: 'Point', coordinates: [req.body.lng, req.body.lat] };
    attendance.workedMinutes = Math.max(
      0,
      Math.round((attendance.logoutAt.getTime() - attendance.loginAt.getTime()) / 60000),
    );
    attendance.status = resolveLogoutStatus({
      loginAt: attendance.loginAt,
      logoutAt: attendance.logoutAt,
      siteLoginTime: site.loginTime,
      siteLogoutTime: site.logoutTime,
    });

    await attendance.save();
    sendSuccess(res, attendance, 'Attendance logout recorded');
  }),
);

/** Employer creates or updates attendance status for a day. */
router.post(
  '/adjust',
  authenticate,
  authorize(ACCOUNT_TYPES.EMPLOYER),
  requireMpinVerified,
  validate(
    z.object({
      employeeId: z.string(),
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      status: statusEnum,
      notes: z.string().max(500).optional(),
      siteId: z.string().optional(),
    }),
  ),
  asyncHandler(async (req, res) => {
    const employee = await OfficeEmployee.findOne({
      _id: req.body.employeeId,
      employerId: req.user!.id,
    });
    if (!employee) throw Errors.notFound('Employee not found');

    const profile = await EmployerProfile.findOne({ userId: req.user!.id });
    if (!profile) throw Errors.forbidden();

    let site = req.body.siteId
      ? await CompanySite.findOne({
          _id: req.body.siteId,
          employerId: req.user!.id,
          isActive: true,
        })
      : null;
    if (!site && employee.primarySiteId) {
      site = await CompanySite.findOne({
        _id: employee.primarySiteId,
        employerId: req.user!.id,
      });
    }
    if (!site) {
      site = await CompanySite.findOne({
        employerId: req.user!.id,
        isActive: true,
      }).sort({ isPrimary: -1, createdAt: 1 });
    }
    if (!site) throw Errors.badRequest('No site configured for this company');

    const existing = await Attendance.findOne({
      employeeId: employee._id,
      date: req.body.date,
    });

    if (existing) {
      existing.status = req.body.status;
      if (req.body.notes !== undefined) existing.notes = req.body.notes;
      await existing.save();
      sendSuccess(res, existing, 'Attendance updated');
      return;
    }

    const created = await Attendance.create({
      employerId: req.user!.id,
      employerProfileId: profile._id,
      employeeId: employee._id,
      userId: employee.userId,
      siteId: site._id,
      date: req.body.date,
      status: req.body.status,
      notes: req.body.notes,
      workedMinutes: 0,
    });

    sendCreated(res, created, 'Attendance created');
  }),
);

router.patch(
  '/:id/status',
  authenticate,
  authorize(ACCOUNT_TYPES.EMPLOYER),
  requireMpinVerified,
  validate(
    z.object({
      status: statusEnum,
      notes: z.string().max(500).optional(),
    }),
  ),
  asyncHandler(async (req, res) => {
    const attendance = await Attendance.findOne({
      _id: req.params.id,
      employerId: req.user!.id,
    });
    if (!attendance) throw Errors.notFound('Attendance not found');

    attendance.status = req.body.status;
    if (req.body.notes !== undefined) attendance.notes = req.body.notes;
    await attendance.save();

    sendSuccess(res, attendance, 'Attendance status updated');
  }),
);

router.get(
  '/',
  authenticate,
  authorize(ACCOUNT_TYPES.EMPLOYER, ACCOUNT_TYPES.OFFICE_EMPLOYEE, ACCOUNT_TYPES.ADMIN),
  requireMpinVerified,
  asyncHandler(async (req, res) => {
    const { page, limit, skip, sort } = getPagination(req, 100, 500);
    const filter: Record<string, unknown> = {};

    if (req.user!.accountType === ACCOUNT_TYPES.EMPLOYER) {
      filter.employerId = req.user!.id;
    } else if (req.user!.accountType === ACCOUNT_TYPES.OFFICE_EMPLOYEE) {
      filter.userId = req.user!.id;
      if (req.query.employerId) filter.employerId = req.query.employerId;
    } else if (req.query.employerId) {
      filter.employerId = req.query.employerId;
    }

    if (req.query.employeeId) filter.employeeId = req.query.employeeId;
    if (req.query.date) filter.date = req.query.date;
    if (req.query.month && req.query.year) {
      const m = String(req.query.month).padStart(2, '0');
      const y = String(req.query.year);
      filter.date = { $regex: `^${y}-${m}` };
    }

    await finalizeMissingLogouts(
      req.user!.accountType === ACCOUNT_TYPES.EMPLOYER
        ? { employerId: req.user!.id }
        : { userId: req.user!.id },
    );

    const [items, total] = await Promise.all([
      Attendance.find(filter)
        .populate('employeeId', 'fullName mobile designation')
        .sort(sort.date ? sort : { date: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Attendance.countDocuments(filter),
    ]);

    sendSuccess(res, items, 'Attendance', 200, paginationMeta(total, page, limit));
  }),
);

export default router;
