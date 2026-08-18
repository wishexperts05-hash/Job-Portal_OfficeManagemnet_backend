import { z } from 'zod';
import { Router } from 'express';
import dayjs from 'dayjs';
import { LocationTrack, OfficeEmployee } from '../../models/index.js';
import { ACCOUNT_TYPES, USER_STATUS } from '../../constants/index.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { sendSuccess } from '../../utils/ApiResponse.js';
import { validate } from '../../middlewares/validate.js';
import { authenticate, authorize, requireMpinVerified } from '../../middlewares/auth.js';
import { Errors } from '../../utils/ApiError.js';

const router = Router();

/** Employee pushes location points (mobile web) when tracking enabled */
router.post(
  '/ping',
  authenticate,
  authorize(ACCOUNT_TYPES.OFFICE_EMPLOYEE),
  requireMpinVerified,
  validate(
    z.object({
      employerId: z.string(),
      lat: z.number(),
      lng: z.number(),
      accuracy: z.number().optional(),
      speed: z.number().optional(),
      recordedAt: z.coerce.date().optional(),
    }),
  ),
  asyncHandler(async (req, res) => {
    const membership = await OfficeEmployee.findOne({
      userId: req.user!.id,
      employerId: req.body.employerId,
      status: USER_STATUS.ACTIVE,
    });
    if (!membership) throw Errors.forbidden();
    if (!membership.locationTrackingEnabled) {
      throw Errors.forbidden('Location tracking is not enabled for you');
    }

    const date = dayjs().format('YYYY-MM-DD');
    const point = {
      coordinates: [req.body.lng, req.body.lat] as [number, number],
      recordedAt: req.body.recordedAt ?? new Date(),
      accuracy: req.body.accuracy,
      speed: req.body.speed,
    };

    const track = await LocationTrack.findOneAndUpdate(
      { employeeId: membership._id, date },
      {
        $setOnInsert: {
          employerId: req.body.employerId,
          employeeId: membership._id,
          userId: req.user!.id,
          date,
        },
        $push: {
          points: {
            $each: [point],
            $slice: -5000, // cap daily points for scale
          },
        },
      },
      { upsert: true, new: true },
    );

    sendSuccess(res, { id: track._id, pointsCount: track.points.length }, 'Location recorded');
  }),
);

router.get(
  '/route',
  authenticate,
  authorize(ACCOUNT_TYPES.EMPLOYER),
  validate(
    z.object({
      employeeId: z.string(),
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    }),
    'query',
  ),
  asyncHandler(async (req, res) => {
    const employeeId = String(req.query.employeeId);
    const date = String(req.query.date);

    const employee = await OfficeEmployee.findOne({
      _id: employeeId,
      employerId: req.user!.id,
    });
    if (!employee) throw Errors.notFound('Employee not found');
    if (!employee.locationTrackingEnabled) {
      throw Errors.forbidden('Tracking not enabled for this employee');
    }

    const track = await LocationTrack.findOne({
      employeeId: employee._id,
      date,
    }).lean();

    sendSuccess(res, track ?? { points: [] }, 'Route history');
  }),
);

export default router;
