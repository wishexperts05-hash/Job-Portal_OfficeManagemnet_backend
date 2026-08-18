import { z } from 'zod';
import { Router } from 'express';
import dayjs from 'dayjs';
import {
  SalaryRecord,
  Attendance,
  OfficeEmployee,
  EmployerProfile,
} from '../../models/index.ts';
import { ACCOUNT_TYPES, ATTENDANCE_STATUS, USER_STATUS } from '../../constants/index.ts';
import { asyncHandler } from '../../utils/asyncHandler.ts';
import { sendSuccess, sendCreated } from '../../utils/ApiResponse.ts';
import { validate } from '../../middlewares/validate.ts';
import { authenticate, authorize, requireMpinVerified } from '../../middlewares/auth.ts';
import { Errors } from '../../utils/ApiError.ts';
import { getPagination, paginationMeta } from '../../utils/pagination.ts';
import { notifySalaryUpdate } from '../../services/notify.service.ts';

const router = Router();

function workingDaysInMonth(year: number, month: number) {
  const days = dayjs(`${year}-${String(month).padStart(2, '0')}-01`).daysInMonth();
  let count = 0;
  for (let d = 1; d <= days; d++) {
    const dow = dayjs(`${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`).day();
    if (dow !== 0) count += 1; // exclude Sundays by default
  }
  return count;
}

router.post(
  '/calculate',
  authenticate,
  authorize(ACCOUNT_TYPES.EMPLOYER),
  validate(
    z.object({
      employeeId: z.string(),
      year: z.number().int().min(2020).max(2100),
      month: z.number().int().min(1).max(12),
      deductions: z.number().min(0).optional(),
      bonuses: z.number().min(0).optional(),
      notes: z.string().optional(),
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

    const prefix = `${req.body.year}-${String(req.body.month).padStart(2, '0')}`;
    const today = dayjs().format('YYYY-MM-DD');

    // Past open sessions (login, no logout) count as absent
    const monthStart = `${req.body.year}-${String(req.body.month).padStart(2, '0')}-01`;
    const monthEnd = `${req.body.year}-${String(req.body.month).padStart(2, '0')}-31`;
    await Attendance.updateMany(
      {
        employeeId: employee._id,
        date: { $gte: monthStart, $lte: monthEnd, $lt: today },
        loginAt: { $ne: null },
        $or: [{ logoutAt: null }, { logoutAt: { $exists: false } }],
        status: { $nin: [ATTENDANCE_STATUS.ON_LEAVE] },
      },
      { $set: { status: ATTENDANCE_STATUS.ABSENT, workedMinutes: 0 } },
    );

    const records = await Attendance.find({
      employeeId: employee._id,
      date: { $regex: `^${prefix}` },
    });

    const presentDays = records.filter(
      (r) => r.status === ATTENDANCE_STATUS.PRESENT && r.logoutAt,
    ).length;
    const halfDays = records.filter((r) => r.status === ATTENDANCE_STATUS.HALF_DAY).length;
    const leaveDays = records.filter((r) => r.status === ATTENDANCE_STATUS.ON_LEAVE).length;
    const workingDays = workingDaysInMonth(req.body.year, req.body.month);
    const absentDays = Math.max(0, workingDays - presentDays - halfDays - leaveDays);

    // Fixed 30-day month basis for daily rate
    const perDay = employee.baseSalary / 30;
    const calculatedAmount = perDay * presentDays + perDay * 0.5 * halfDays;
    const deductions = req.body.deductions ?? 0;
    const bonuses = req.body.bonuses ?? 0;
    const netAmount = Math.max(0, calculatedAmount - deductions + bonuses);

    const salary = await SalaryRecord.findOneAndUpdate(
      {
        employeeId: employee._id,
        year: req.body.year,
        month: req.body.month,
      },
      {
        $set: {
          employerId: req.user!.id,
          employerProfileId: profile._id,
          userId: employee.userId,
          presentDays,
          halfDays,
          absentDays,
          leaveDays,
          workingDaysInMonth: workingDays,
          baseSalary: employee.baseSalary,
          calculatedAmount: Math.round(calculatedAmount),
          deductions,
          bonuses,
          netAmount: Math.round(netAmount),
          status: 'draft',
          notes: req.body.notes,
          createdBy: req.user!.id,
        },
      },
      { upsert: true, new: true },
    );

    sendCreated(res, salary, 'Salary calculated');
  }),
);

router.patch(
  '/:id/status',
  authenticate,
  authorize(ACCOUNT_TYPES.EMPLOYER),
  validate(
    z.object({
      status: z.enum(['draft', 'finalized', 'paid']),
    }),
  ),
  asyncHandler(async (req, res) => {
    const salary = await SalaryRecord.findOne({
      _id: req.params.id,
      employerId: req.user!.id,
    });
    if (!salary) throw Errors.notFound('Salary record not found');

    salary.status = req.body.status;
    if (req.body.status === 'paid') salary.paidAt = new Date();
    await salary.save();

    if (req.body.status === 'finalized' || req.body.status === 'paid') {
      void notifySalaryUpdate({
        employeeUserId: String(salary.userId),
        month: salary.month,
        year: salary.year,
        status: salary.status,
        netAmount: salary.netAmount,
      });
    }

    sendSuccess(res, salary, 'Salary status updated');
  }),
);

router.get(
  '/',
  authenticate,
  authorize(ACCOUNT_TYPES.EMPLOYER, ACCOUNT_TYPES.OFFICE_EMPLOYEE),
  requireMpinVerified,
  asyncHandler(async (req, res) => {
    const { page, limit, skip, sort } = getPagination(req, 50, 300);
    const filter: Record<string, unknown> = {};

    if (req.user!.accountType === ACCOUNT_TYPES.EMPLOYER) {
      filter.employerId = req.user!.id;
      if (req.query.employeeId) filter.employeeId = req.query.employeeId;
    } else {
      filter.userId = req.user!.id;
      if (req.query.employerId) filter.employerId = req.query.employerId;
    }

    if (req.query.year) filter.year = Number(req.query.year);
    if (req.query.month) filter.month = Number(req.query.month);

    const [items, total] = await Promise.all([
      SalaryRecord.find(filter)
        .populate('employeeId', 'fullName mobile designation department baseSalary')
        .sort(sort.year || sort.month ? sort : { year: -1, month: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      SalaryRecord.countDocuments(filter),
    ]);

    sendSuccess(res, items, 'Salary records', 200, paginationMeta(total, page, limit));
  }),
);

export default router;
