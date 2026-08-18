import { z } from 'zod';
import { Router } from 'express';
import { RegistrationLead } from '../../models/index.js';
import { ACCOUNT_TYPES, LEAD_STATUS } from '../../constants/index.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { sendSuccess } from '../../utils/ApiResponse.js';
import { validate } from '../../middlewares/validate.js';
import { normalizeMobile, isValidIndianMobile } from '../../utils/mobile.js';
import { Errors } from '../../utils/ApiError.js';
import { authenticate, authorize } from '../../middlewares/auth.js';
import { getPagination, paginationMeta } from '../../utils/pagination.js';
import {
  notifyAdminsIncompleteLead,
  notifyAdminsLeadAbandoned,
} from '../../services/notify.service.js';

const router = Router();

/** Public: capture incomplete registration after mobile is entered */
router.post(
  '/capture',
  validate(
    z.object({
      accountType: z.enum([ACCOUNT_TYPES.EMPLOYER, ACCOUNT_TYPES.JOB_SEEKER]),
      mobile: z.string().min(10),
      formData: z.record(z.string(), z.unknown()).default({}),
      progressPercent: z.number().min(0).max(100).default(10),
      lastStep: z.string().optional(),
      locale: z.enum(['en', 'hi']).optional(),
    }),
  ),
  asyncHandler(async (req, res) => {
    const mobile = normalizeMobile(req.body.mobile);
    if (!isValidIndianMobile(mobile)) throw Errors.badRequest('Invalid mobile number');

    const existing = await RegistrationLead.findOne({
      mobile,
      accountType: req.body.accountType,
      status: { $in: [LEAD_STATUS.IN_PROGRESS, LEAD_STATUS.ABANDONED] },
    }).lean();

    const lead = await RegistrationLead.findOneAndUpdate(
      {
        mobile,
        accountType: req.body.accountType,
        status: { $in: [LEAD_STATUS.IN_PROGRESS, LEAD_STATUS.ABANDONED] },
      },
      {
        $set: {
          formData: req.body.formData,
          progressPercent: req.body.progressPercent,
          lastStep: req.body.lastStep,
          locale: req.body.locale ?? 'en',
          status: LEAD_STATUS.IN_PROGRESS,
          ipAddress: req.ip,
          userAgent: req.get('user-agent') ?? undefined,
        },
        $setOnInsert: {
          mobile,
          accountType: req.body.accountType,
        },
      },
      { upsert: true, new: true },
    );

    // Notify admins when a new incomplete lead appears (or abandoned lead restarts)
    if (!existing || existing.status === LEAD_STATUS.ABANDONED) {
      void notifyAdminsIncompleteLead({
        leadId: String(lead._id),
        mobile,
        accountType: req.body.accountType,
        progressPercent: req.body.progressPercent,
        lastStep: req.body.lastStep,
      });
    }

    sendSuccess(res, lead, 'Lead captured');
  }),
);

/** Mark abandoned (optional beacon / frontend unload) */
router.post(
  '/abandon',
  validate(
    z.object({
      accountType: z.enum([ACCOUNT_TYPES.EMPLOYER, ACCOUNT_TYPES.JOB_SEEKER]),
      mobile: z.string().min(10),
    }),
  ),
  asyncHandler(async (req, res) => {
    const mobile = normalizeMobile(req.body.mobile);
    const result = await RegistrationLead.updateMany(
      {
        mobile,
        accountType: req.body.accountType,
        status: LEAD_STATUS.IN_PROGRESS,
      },
      { $set: { status: LEAD_STATUS.ABANDONED } },
    );

    if (result.modifiedCount > 0) {
      void notifyAdminsLeadAbandoned({
        mobile,
        accountType: req.body.accountType,
      });
    }

    sendSuccess(res, null, 'Marked abandoned');
  }),
);

router.get(
  '/',
  authenticate,
  authorize(ACCOUNT_TYPES.ADMIN),
  asyncHandler(async (req, res) => {
    const { page, limit, skip, sort } = getPagination(req);
    const filter: Record<string, unknown> = {};
    if (req.query.status) filter.status = req.query.status;
    if (req.query.accountType) filter.accountType = req.query.accountType;
    if (req.query.mobile) filter.mobile = String(req.query.mobile);

    const [items, total] = await Promise.all([
      RegistrationLead.find(filter).sort(sort).skip(skip).limit(limit).lean(),
      RegistrationLead.countDocuments(filter),
    ]);

    sendSuccess(res, items, 'Leads fetched', 200, paginationMeta(total, page, limit));
  }),
);

router.patch(
  '/:id',
  authenticate,
  authorize(ACCOUNT_TYPES.ADMIN),
  validate(
    z.object({
      status: z.enum(Object.values(LEAD_STATUS) as [string, ...string[]]).optional(),
      notes: z.string().optional(),
      contactedAt: z.coerce.date().optional(),
    }),
  ),
  asyncHandler(async (req, res) => {
    const lead = await RegistrationLead.findByIdAndUpdate(req.params.id, { $set: req.body }, { new: true });
    if (!lead) throw Errors.notFound('Lead not found');
    sendSuccess(res, lead, 'Lead updated');
  }),
);

export default router;
