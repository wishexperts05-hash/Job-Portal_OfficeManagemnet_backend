import { z } from 'zod';
import { Router } from 'express';
import mongoose from 'mongoose';
import { Expenditure, EmployerProfile, OfficeEmployee } from '../../models/index.ts';
import { ACCOUNT_TYPES, TXN_TYPE, USER_STATUS } from '../../constants/index.ts';
import { asyncHandler } from '../../utils/asyncHandler.ts';
import { sendSuccess, sendCreated } from '../../utils/ApiResponse.ts';
import { validate } from '../../middlewares/validate.ts';
import { authenticate, authorize, requireMpinVerified } from '../../middlewares/auth.ts';
import { Errors } from '../../utils/ApiError.ts';
import { getPagination, paginationMeta } from '../../utils/pagination.ts';

const router = Router();

async function membershipsForUser(userId: string, employerId?: string) {
  return OfficeEmployee.find({
    userId,
    status: USER_STATUS.ACTIVE,
    ...(employerId ? { employerId } : {}),
  });
}

/** Company-level (employer-owned) vs employee-owned personal expenses */
function companyOnlyFilter() {
  return {
    $or: [{ employeeId: { $exists: false } }, { employeeId: null }],
  };
}

function parseLocalDay(raw: unknown, endOfDay = false) {
  const text = String(raw).slice(0, 10);
  const [year, month, day] = text.split('-').map(Number);
  if (!year || !month || !day) throw Errors.badRequest('Invalid date');
  return endOfDay
    ? new Date(year, month - 1, day, 23, 59, 59, 999)
    : new Date(year, month - 1, day, 0, 0, 0, 0);
}

function applyDateRangeFilter(target: Record<string, unknown>, fromRaw?: unknown, toRaw?: unknown) {
  if (!fromRaw && !toRaw) return;
  const transactionDate: Record<string, Date> = {};
  if (fromRaw) transactionDate.$gte = parseLocalDay(fromRaw, false);
  if (toRaw) transactionDate.$lte = parseLocalDay(toRaw, true);
  target.transactionDate = transactionDate;
}

function toObjectId(value: string) {
  if (!mongoose.isValidObjectId(value)) throw Errors.badRequest('Invalid id');
  return new mongoose.Types.ObjectId(value);
}

router.get(
  '/',
  authenticate,
  authorize(ACCOUNT_TYPES.EMPLOYER, ACCOUNT_TYPES.OFFICE_EMPLOYEE, ACCOUNT_TYPES.ADMIN),
  requireMpinVerified,
  asyncHandler(async (req, res) => {
    const { page, limit, skip, sort } = getPagination(req);
    const filter: Record<string, unknown> = {};

    if (req.user!.accountType === ACCOUNT_TYPES.EMPLOYER) {
      // Employer sees only company expenditures (not employees' personal logs)
      filter.employerId = req.user!.id;
      Object.assign(filter, companyOnlyFilter());
    } else if (req.user!.accountType === ACCOUNT_TYPES.OFFICE_EMPLOYEE) {
      // Employee sees only their own expenditures
      const employerId = req.query.employerId ? String(req.query.employerId) : undefined;
      const memberships = await membershipsForUser(req.user!.id, employerId);
      if (!memberships.length) throw Errors.forbidden();
      filter.employeeId = { $in: memberships.map((m) => m._id) };
      if (employerId) filter.employerId = employerId;
    } else if (req.query.employerId) {
      filter.employerId = req.query.employerId;
    }

    if (req.query.type) filter.type = req.query.type;
    if (req.query.category) filter.category = req.query.category;
    applyDateRangeFilter(filter, req.query.from, req.query.to);

    const [items, total] = await Promise.all([
      Expenditure.find(filter).sort(sort).skip(skip).limit(limit).lean(),
      Expenditure.countDocuments(filter),
    ]);

    sendSuccess(res, items, 'Transactions', 200, paginationMeta(total, page, limit));
  }),
);

router.post(
  '/',
  authenticate,
  authorize(ACCOUNT_TYPES.EMPLOYER, ACCOUNT_TYPES.OFFICE_EMPLOYEE),
  requireMpinVerified,
  validate(
    z.object({
      employerId: z.string().optional(),
      type: z.enum([TXN_TYPE.CREDIT, TXN_TYPE.DEBIT]),
      amount: z.number().positive(),
      category: z.string().min(1),
      categoryHi: z.string().optional(),
      description: z.string().optional(),
      siteId: z.string().optional(),
      transactionDate: z.coerce.date(),
      paymentMode: z.enum(['cash', 'upi', 'bank', 'cheque', 'other']).optional(),
      referenceNo: z.string().optional(),
      attachmentUrl: z.string().url().optional(),
    }),
  ),
  asyncHandler(async (req, res) => {
    let employerId = req.user!.id;
    let createdByRole: 'employer' | 'office_employee' = 'employer';
    let employeeId: string | undefined;

    if (req.user!.accountType === ACCOUNT_TYPES.OFFICE_EMPLOYEE) {
      employerId = req.body.employerId;
      if (!employerId) throw Errors.badRequest('employerId required');
      const membership = await OfficeEmployee.findOne({
        userId: req.user!.id,
        employerId,
        status: USER_STATUS.ACTIVE,
      });
      if (!membership) throw Errors.forbidden('Not a member of this company');
      createdByRole = 'office_employee';
      employeeId = String(membership._id);
    }

    const profile = await EmployerProfile.findOne({ userId: employerId });
    if (!profile) throw Errors.notFound('Employer profile not found');

    const txn = await Expenditure.create({
      employerId,
      employerProfileId: profile._id,
      type: req.body.type,
      amount: req.body.amount,
      category: req.body.category,
      categoryHi: req.body.categoryHi,
      description: req.body.description,
      employeeId,
      siteId: req.body.siteId,
      transactionDate: req.body.transactionDate,
      paymentMode: req.body.paymentMode ?? 'cash',
      referenceNo: req.body.referenceNo,
      attachmentUrl: req.body.attachmentUrl,
      createdBy: req.user!.id,
      createdByRole,
    });

    sendCreated(res, txn, 'Transaction recorded');
  }),
);

router.get(
  '/summary',
  authenticate,
  authorize(ACCOUNT_TYPES.EMPLOYER, ACCOUNT_TYPES.OFFICE_EMPLOYEE, ACCOUNT_TYPES.ADMIN),
  requireMpinVerified,
  asyncHandler(async (req, res) => {
    const match: Record<string, unknown> = {};

    if (req.user!.accountType === ACCOUNT_TYPES.EMPLOYER) {
      match.employerId = toObjectId(req.user!.id);
      Object.assign(match, companyOnlyFilter());
    } else if (req.user!.accountType === ACCOUNT_TYPES.OFFICE_EMPLOYEE) {
      const employerId = req.query.employerId ? String(req.query.employerId) : undefined;
      const memberships = await membershipsForUser(req.user!.id, employerId);
      if (!memberships.length) throw Errors.forbidden();
      match.employeeId = { $in: memberships.map((m) => m._id) };
      if (employerId) match.employerId = toObjectId(employerId);
    } else {
      const employerId = String(req.query.employerId || '');
      if (!employerId) throw Errors.badRequest('employerId required');
      match.employerId = toObjectId(employerId);
    }

    applyDateRangeFilter(match, req.query.from, req.query.to);

    const summary = await Expenditure.aggregate([
      { $match: match },
      {
        $group: {
          _id: '$type',
          total: { $sum: '$amount' },
          count: { $sum: 1 },
        },
      },
    ]);

    const credit = summary.find((s) => s._id === TXN_TYPE.CREDIT)?.total ?? 0;
    const debit = summary.find((s) => s._id === TXN_TYPE.DEBIT)?.total ?? 0;

    sendSuccess(res, { credit, debit, balance: credit - debit, breakdown: summary }, 'Summary');
  }),
);

export default router;
