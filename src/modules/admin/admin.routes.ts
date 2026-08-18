import { z } from 'zod';
import { Router } from 'express';
import mongoose from 'mongoose';
import {
  User,
  EmployerProfile,
  JobSeekerProfile,
  OfficeEmployee,
  Job,
  JobApplication,
  Expenditure,
  Task,
  Attendance,
  CompanySite,
  SalaryRecord,
  SubscriptionPlan,
  EmployerSubscription,
} from '../../models/index.ts';
import { ACCOUNT_TYPES, JOB_STATUS, USER_STATUS, SUBSCRIPTION_STATUS } from '../../constants/index.ts';
import { asyncHandler } from '../../utils/asyncHandler.ts';
import { sendSuccess } from '../../utils/ApiResponse.ts';
import { validate } from '../../middlewares/validate.ts';
import { authenticate, authorize } from '../../middlewares/auth.ts';
import { Errors } from '../../utils/ApiError.ts';
import { getPagination, paginationMeta } from '../../utils/pagination.ts';
import { normalizeMobile, isValidIndianMobile } from '../../utils/mobile.ts';
import {
  employerProfileFieldsSchema,
  pruneEmpty,
} from '../profile/profile.schemas.ts';
import {
  notifyJobApproved,
  notifyJobRejected,
} from '../../services/notify.service.ts';

const router = Router();

router.use(authenticate, authorize(ACCOUNT_TYPES.ADMIN));

router.get(
  '/dashboard',
  asyncHandler(async (_req, res) => {
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 5);
    sixMonthsAgo.setDate(1);
    sixMonthsAgo.setHours(0, 0, 0, 0);

    const [
      employers,
      seekers,
      officeEmployees,
      jobsPublished,
      jobsPending,
      pendingUsers,
      jobsByStatus,
      registrationsByMonth,
    ] = await Promise.all([
      User.countDocuments({ accountType: ACCOUNT_TYPES.EMPLOYER }),
      User.countDocuments({ accountType: ACCOUNT_TYPES.JOB_SEEKER }),
      User.countDocuments({ accountType: ACCOUNT_TYPES.OFFICE_EMPLOYEE }),
      Job.countDocuments({ status: JOB_STATUS.PUBLISHED }),
      Job.countDocuments({ status: JOB_STATUS.PENDING_APPROVAL }),
      User.countDocuments({ status: USER_STATUS.PENDING }),
      Job.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
      User.aggregate([
        {
          $match: {
            accountType: { $in: [ACCOUNT_TYPES.EMPLOYER, ACCOUNT_TYPES.JOB_SEEKER] },
            createdAt: { $gte: sixMonthsAgo },
          },
        },
        {
          $group: {
            _id: {
              year: { $year: '$createdAt' },
              month: { $month: '$createdAt' },
              accountType: '$accountType',
            },
            count: { $sum: 1 },
          },
        },
        { $sort: { '_id.year': 1, '_id.month': 1 } },
      ]),
    ]);

    const monthKeys: string[] = [];
    for (let i = 0; i < 6; i++) {
      const d = new Date(sixMonthsAgo);
      d.setMonth(sixMonthsAgo.getMonth() + i);
      monthKeys.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
    }

    const registrationTrend = monthKeys.map((key) => {
      const [year, month] = key.split('-').map(Number);
      const employersCount =
        registrationsByMonth.find(
          (row) =>
            row._id.year === year &&
            row._id.month === month &&
            row._id.accountType === ACCOUNT_TYPES.EMPLOYER,
        )?.count ?? 0;
      const seekersCount =
        registrationsByMonth.find(
          (row) =>
            row._id.year === year &&
            row._id.month === month &&
            row._id.accountType === ACCOUNT_TYPES.JOB_SEEKER,
        )?.count ?? 0;
      return { month: key, employers: employersCount, seekers: seekersCount };
    });

    sendSuccess(
      res,
      {
        employers,
        seekers,
        officeEmployees,
        jobsPublished,
        jobsPending,
        pendingUsers,
        usersBreakdown: [
          { name: 'employers', value: employers },
          { name: 'seekers', value: seekers },
          { name: 'officeEmployees', value: officeEmployees },
        ],
        jobsByStatus: jobsByStatus.map((row) => ({
          status: String(row._id || 'unknown'),
          count: row.count as number,
        })),
        registrationTrend,
      },
      'Dashboard stats',
    );
  }),
);

router.get(
  '/employers',
  asyncHandler(async (req, res) => {
    const { page, limit, skip, sort } = getPagination(req);
    const filter: Record<string, unknown> = { accountType: ACCOUNT_TYPES.EMPLOYER };
    if (req.query.status) filter.status = req.query.status;
    if (req.query.q) {
      const q = String(req.query.q).trim();
      if (q) {
        const profiles = await EmployerProfile.find({
          $or: [
            { companyName: new RegExp(q, 'i') },
            { ownerName: new RegExp(q, 'i') },
            { city: new RegExp(q, 'i') },
            { contactMobile: new RegExp(q, 'i') },
          ],
        })
          .select('userId')
          .lean();
        filter.$or = [
          { mobile: new RegExp(q, 'i') },
          { _id: { $in: profiles.map((p) => p.userId) } },
        ];
      }
    }

    const users = await User.find(filter).sort(sort).skip(skip).limit(limit).lean();
    const total = await User.countDocuments(filter);
    const profiles = await EmployerProfile.find({
      userId: { $in: users.map((u) => u._id) },
    }).lean();
    const profileMap = new Map(profiles.map((p) => [String(p.userId), p]));
    const items = users.map((u) => ({ ...u, profile: profileMap.get(String(u._id)) ?? null }));
    sendSuccess(res, items, 'Employers', 200, paginationMeta(total, page, limit));
  }),
);

router.post(
  '/employers',
  validate(
    employerProfileFieldsSchema.extend({
      mobile: z.string().min(10).max(15),
      preferredLocale: z.enum(['en', 'hi']).optional(),
      status: z.enum([USER_STATUS.ACTIVE, USER_STATUS.INACTIVE, USER_STATUS.PENDING]).optional(),
    }),
  ),
  asyncHandler(async (req, res) => {
    const mobile = normalizeMobile(req.body.mobile);
    if (!isValidIndianMobile(mobile)) throw Errors.badRequest('Invalid mobile number');

    const exists = await User.findOne({ mobile, accountType: ACCOUNT_TYPES.EMPLOYER });
    if (exists) throw Errors.conflict('This mobile number is already registered as an employer');

    const { mobile: _m, preferredLocale, status, ...rest } = req.body;
    const fields = pruneEmpty(rest);

    const user = await User.create({
      accountType: ACCOUNT_TYPES.EMPLOYER,
      mobile,
      status: status ?? USER_STATUS.ACTIVE,
      preferredLocale: preferredLocale ?? 'en',
    });

    const profile = await EmployerProfile.create({
      ...fields,
      userId: user._id,
      companyName: req.body.companyName,
      ownerName: req.body.ownerName,
      contactMobile: fields.contactMobile || mobile,
      industryType: fields.industryType || 'hosiery',
      isOfficeEnabled: true,
      registrationCompleted: true,
      country: fields.country || 'India',
    });

    const freePlan = await SubscriptionPlan.findOne({ code: 'FREE_LAUNCH', isActive: true });
    if (freePlan) {
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

    sendSuccess(
      res,
      {
        user: {
          id: user.id,
          _id: user.id,
          accountType: user.accountType,
          mobile: user.mobile,
          status: user.status,
          preferredLocale: user.preferredLocale,
        },
        profile,
      },
      'Employer created',
      201,
    );
  }),
);

router.get(
  '/employers/:userId',
  asyncHandler(async (req, res) => {
    if (!mongoose.isValidObjectId(req.params.userId)) throw Errors.badRequest('Invalid employer id');

    const user = await User.findOne({
      _id: req.params.userId,
      accountType: ACCOUNT_TYPES.EMPLOYER,
    }).lean();
    if (!user) throw Errors.notFound('Employer not found');

    const profile = await EmployerProfile.findOne({ userId: user._id }).lean();
    const employerId = user._id;

    const [
      jobs,
      employees,
      tasks,
      attendance,
      expenditures,
      sites,
      salaries,
      counts,
      financeAgg,
    ] = await Promise.all([
      Job.find({ employerId }).sort({ createdAt: -1 }).limit(100).lean(),
      OfficeEmployee.find({ employerId })
        .sort({ createdAt: -1 })
        .limit(200)
        .lean(),
      Task.find({ employerId })
        .sort({ createdAt: -1 })
        .limit(100)
        .populate('assignedToEmployeeIds', 'fullName mobile designation')
        .lean(),
      Attendance.find({ employerId })
        .sort({ date: -1 })
        .limit(100)
        .populate('employeeId', 'fullName mobile designation')
        .lean(),
      Expenditure.find({ employerId }).sort({ transactionDate: -1 }).limit(100).lean(),
      CompanySite.find({ employerId }).sort({ createdAt: -1 }).limit(50).lean(),
      SalaryRecord.find({ employerId }).sort({ createdAt: -1 }).limit(50).lean(),
      Promise.all([
        Job.countDocuments({ employerId }),
        OfficeEmployee.countDocuments({ employerId }),
        Task.countDocuments({ employerId }),
        Attendance.countDocuments({ employerId }),
        Expenditure.countDocuments({ employerId }),
        CompanySite.countDocuments({ employerId }),
      ]),
      Expenditure.aggregate([
        { $match: { employerId } },
        { $group: { _id: '$type', total: { $sum: '$amount' } } },
      ]),
    ]);

    const credit = financeAgg.find((row) => row._id === 'credit')?.total ?? 0;
    const debit = financeAgg.find((row) => row._id === 'debit')?.total ?? 0;

    sendSuccess(
      res,
      {
        user,
        profile,
        counts: {
          jobs: counts[0],
          employees: counts[1],
          tasks: counts[2],
          attendance: counts[3],
          expenditures: counts[4],
          sites: counts[5],
        },
        finance: { credit, debit, balance: credit - debit },
        jobs,
        employees,
        tasks,
        attendance,
        expenditures,
        sites,
        salaries,
      },
      'Employer details',
    );
  }),
);

router.patch(
  '/employers/:userId',
  validate(
    employerProfileFieldsSchema.partial().extend({
      mobile: z.string().min(10).max(15).optional(),
      preferredLocale: z.enum(['en', 'hi']).optional(),
      status: z
        .enum([USER_STATUS.ACTIVE, USER_STATUS.INACTIVE, USER_STATUS.SUSPENDED, USER_STATUS.PENDING])
        .optional(),
      isOfficeEnabled: z.boolean().optional(),
    }),
  ),
  asyncHandler(async (req, res) => {
    if (!mongoose.isValidObjectId(req.params.userId)) throw Errors.badRequest('Invalid employer id');

    const user = await User.findOne({
      _id: req.params.userId,
      accountType: ACCOUNT_TYPES.EMPLOYER,
    });
    if (!user) throw Errors.notFound('Employer not found');

    if (req.body.mobile) {
      const mobile = normalizeMobile(req.body.mobile);
      if (!isValidIndianMobile(mobile)) throw Errors.badRequest('Invalid mobile number');
      const clash = await User.findOne({
        mobile,
        accountType: ACCOUNT_TYPES.EMPLOYER,
        _id: { $ne: user._id },
      });
      if (clash) throw Errors.conflict('This mobile number is already registered as an employer');
      user.mobile = mobile;
    }
    if (req.body.status) user.status = req.body.status;
    if (req.body.preferredLocale) user.preferredLocale = req.body.preferredLocale;
    await user.save();

    const {
      mobile: _m,
      status: _s,
      preferredLocale: _l,
      isOfficeEnabled,
      ...rest
    } = req.body;
    const fields = pruneEmpty(rest);

    let profile = await EmployerProfile.findOne({ userId: user._id });
    if (!profile) {
      if (!req.body.companyName || !req.body.ownerName) {
        throw Errors.badRequest('companyName and ownerName are required to create profile');
      }
      profile = await EmployerProfile.create({
        ...fields,
        userId: user._id,
        companyName: req.body.companyName,
        ownerName: req.body.ownerName,
        contactMobile: fields.contactMobile || user.mobile,
        industryType: fields.industryType || 'hosiery',
        isOfficeEnabled: isOfficeEnabled ?? true,
        registrationCompleted: true,
      });
    } else {
      Object.assign(profile, fields);
      if (typeof isOfficeEnabled === 'boolean') profile.isOfficeEnabled = isOfficeEnabled;
      await profile.save();
    }

    sendSuccess(res, { user, profile }, 'Employer updated');
  }),
);

router.patch(
  '/employers/:userId/status',
  validate(z.object({ status: z.enum([USER_STATUS.ACTIVE, USER_STATUS.INACTIVE, USER_STATUS.SUSPENDED]) })),
  asyncHandler(async (req, res) => {
    const user = await User.findOneAndUpdate(
      { _id: req.params.userId, accountType: ACCOUNT_TYPES.EMPLOYER },
      { $set: { status: req.body.status } },
      { new: true },
    );
    if (!user) throw Errors.notFound('Employer not found');
    sendSuccess(res, user, 'Employer status updated');
  }),
);

router.get(
  '/employees',
  asyncHandler(async (req, res) => {
    const { page, limit, skip, sort } = getPagination(req);
    const filter: Record<string, unknown> = {};

    if (req.query.employerId && mongoose.isValidObjectId(String(req.query.employerId))) {
      filter.employerId = new mongoose.Types.ObjectId(String(req.query.employerId));
    }
    if (req.query.status) filter.status = req.query.status;
    if (req.query.q) {
      const q = String(req.query.q).trim();
      if (q) {
        filter.$or = [
          { fullName: new RegExp(q, 'i') },
          { fullNameHi: new RegExp(q, 'i') },
          { mobile: new RegExp(q, 'i') },
          { employeeCode: new RegExp(q, 'i') },
          { designation: new RegExp(q, 'i') },
        ];
      }
    }

    const [items, total] = await Promise.all([
      OfficeEmployee.find(filter)
        .sort(sort)
        .skip(skip)
        .limit(limit)
        .populate('employerProfileId', 'companyName city ownerName')
        .lean(),
      OfficeEmployee.countDocuments(filter),
    ]);

    sendSuccess(res, items, 'Employees', 200, paginationMeta(total, page, limit));
  }),
);

router.get(
  '/employees/:employeeId',
  asyncHandler(async (req, res) => {
    if (!mongoose.isValidObjectId(req.params.employeeId)) {
      throw Errors.badRequest('Invalid employee id');
    }

    const employee = await OfficeEmployee.findById(req.params.employeeId)
      .populate('employerProfileId', 'companyName city ownerName contactMobile')
      .populate('primarySiteId', 'name city address')
      .lean();
    if (!employee) throw Errors.notFound('Employee not found');

    const allEmployments = await OfficeEmployee.find({ userId: employee.userId })
      .populate('employerProfileId', 'companyName city ownerName')
      .sort({ createdAt: -1 })
      .lean();

    const employmentIds = allEmployments.map((row) => row._id);
    const employerIds = allEmployments.map((row) => row.employerId);

    let selectedEmployerId: mongoose.Types.ObjectId | null = null;
    if (req.query.employerId && mongoose.isValidObjectId(String(req.query.employerId))) {
      selectedEmployerId = new mongoose.Types.ObjectId(String(req.query.employerId));
    }

    const relatedEmployeeIds = selectedEmployerId
      ? allEmployments
          .filter((row) => String(row.employerId) === String(selectedEmployerId))
          .map((row) => row._id)
      : employmentIds;

    const relatedEmployerIds = selectedEmployerId ? [selectedEmployerId] : employerIds;

    const taskFilter: Record<string, unknown> = {
      assignedToEmployeeIds: { $in: relatedEmployeeIds },
    };
    const attendanceFilter: Record<string, unknown> = {
      employeeId: { $in: relatedEmployeeIds },
    };
    const salaryFilter: Record<string, unknown> = {
      employeeId: { $in: relatedEmployeeIds },
    };
    const expenditureQuery: Record<string, unknown> = {
      employeeId: { $in: relatedEmployeeIds },
    };
    if (selectedEmployerId) {
      expenditureQuery.employerId = selectedEmployerId;
    }

    const [tasks, attendance, salaries, expenditures, counts] = await Promise.all([
      Task.find(taskFilter)
        .sort({ createdAt: -1 })
        .limit(100)
        .populate('employerProfileId', 'companyName')
        .lean(),
      Attendance.find(attendanceFilter)
        .sort({ date: -1 })
        .limit(100)
        .populate('employerProfileId', 'companyName')
        .populate('siteId', 'name city')
        .lean(),
      SalaryRecord.find(salaryFilter)
        .sort({ year: -1, month: -1 })
        .limit(50)
        .populate('employerProfileId', 'companyName')
        .lean(),
      Expenditure.find(expenditureQuery)
        .sort({ transactionDate: -1 })
        .limit(100)
        .populate('employerProfileId', 'companyName')
        .lean(),
      Promise.all([
        Task.countDocuments({ assignedToEmployeeIds: { $in: employmentIds } }),
        Attendance.countDocuments({ employeeId: { $in: employmentIds } }),
        SalaryRecord.countDocuments({ employeeId: { $in: employmentIds } }),
        Expenditure.countDocuments({ employeeId: { $in: employmentIds } }),
        OfficeEmployee.countDocuments({ userId: employee.userId }),
      ]),
    ]);

    const financeAgg = await Expenditure.aggregate([
      { $match: { employeeId: { $in: relatedEmployeeIds } } },
      { $group: { _id: '$type', total: { $sum: '$amount' } } },
    ]);
    const credit = financeAgg.find((row) => row._id === 'credit')?.total ?? 0;
    const debit = financeAgg.find((row) => row._id === 'debit')?.total ?? 0;

    sendSuccess(
      res,
      {
        employee,
        employments: allEmployments,
        selectedEmployerId: selectedEmployerId ? String(selectedEmployerId) : null,
        counts: {
          tasks: counts[0],
          attendance: counts[1],
          salaries: counts[2],
          expenditures: counts[3],
          companies: counts[4],
        },
        finance: { credit, debit, balance: credit - debit },
        tasks,
        attendance,
        salaries,
        expenditures,
        relatedEmployerIds: relatedEmployerIds.map(String),
      },
      'Employee details',
    );
  }),
);

router.get(
  '/job-seekers',
  asyncHandler(async (req, res) => {
    const { page, limit, skip, sort } = getPagination(req);
    const filter: Record<string, unknown> = { accountType: ACCOUNT_TYPES.JOB_SEEKER };
    if (req.query.status) filter.status = req.query.status;

    if (req.query.q) {
      const q = String(req.query.q).trim();
      if (q) {
        const profiles = await JobSeekerProfile.find({
          $or: [
            { fullName: new RegExp(q, 'i') },
            { fullNameHi: new RegExp(q, 'i') },
            { city: new RegExp(q, 'i') },
            { email: new RegExp(q, 'i') },
            { skills: new RegExp(q, 'i') },
          ],
        })
          .select('userId')
          .lean();
        filter.$or = [
          { mobile: new RegExp(q, 'i') },
          { _id: { $in: profiles.map((p) => p.userId) } },
        ];
      }
    }

    const users = await User.find(filter).sort(sort).skip(skip).limit(limit).lean();
    const total = await User.countDocuments(filter);
    const userIds = users.map((u) => u._id);

    const [profiles, applicationCounts] = await Promise.all([
      JobSeekerProfile.find({ userId: { $in: userIds } }).lean(),
      JobApplication.aggregate([
        { $match: { seekerId: { $in: userIds } } },
        { $group: { _id: '$seekerId', count: { $sum: 1 } } },
      ]),
    ]);

    const profileMap = new Map(profiles.map((p) => [String(p.userId), p]));
    const appsMap = new Map(applicationCounts.map((row) => [String(row._id), row.count as number]));

    sendSuccess(
      res,
      users.map((u) => ({
        ...u,
        profile: profileMap.get(String(u._id)) ?? null,
        applicationsCount: appsMap.get(String(u._id)) ?? 0,
      })),
      'Job seekers',
      200,
      paginationMeta(total, page, limit),
    );
  }),
);

router.get(
  '/job-seekers/:userId',
  asyncHandler(async (req, res) => {
    if (!mongoose.isValidObjectId(req.params.userId)) {
      throw Errors.badRequest('Invalid job seeker id');
    }

    const user = await User.findOne({
      _id: req.params.userId,
      accountType: ACCOUNT_TYPES.JOB_SEEKER,
    }).lean();
    if (!user) throw Errors.notFound('Job seeker not found');

    const profile = await JobSeekerProfile.findOne({ userId: user._id }).lean();

    const applications = await JobApplication.find({ seekerId: user._id })
      .sort({ createdAt: -1 })
      .limit(100)
      .populate({
        path: 'jobId',
        select: 'titleEn titleHi city state status salaryMin salaryMax salaryType employmentType',
        populate: { path: 'employerProfileId', select: 'companyName city' },
      })
      .lean();

    const statusBreakdown = await JobApplication.aggregate([
      { $match: { seekerId: user._id } },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]);

    sendSuccess(
      res,
      {
        user,
        profile,
        applications,
        counts: {
          applications: applications.length,
          totalApplications: statusBreakdown.reduce((sum, row) => sum + (row.count as number), 0),
          byStatus: statusBreakdown.map((row) => ({
            status: String(row._id || 'unknown'),
            count: row.count as number,
          })),
        },
      },
      'Job seeker details',
    );
  }),
);

router.patch(
  '/job-seekers/:userId/status',
  validate(
    z.object({
      status: z.enum([
        USER_STATUS.ACTIVE,
        USER_STATUS.INACTIVE,
        USER_STATUS.SUSPENDED,
        USER_STATUS.PENDING,
      ]),
    }),
  ),
  asyncHandler(async (req, res) => {
    if (!mongoose.isValidObjectId(req.params.userId)) {
      throw Errors.badRequest('Invalid job seeker id');
    }

    const user = await User.findOneAndUpdate(
      { _id: req.params.userId, accountType: ACCOUNT_TYPES.JOB_SEEKER },
      { $set: { status: req.body.status } },
      { new: true },
    );
    if (!user) throw Errors.notFound('Job seeker not found');
    sendSuccess(res, user, 'Job seeker status updated');
  }),
);

router.get(
  '/jobs',
  asyncHandler(async (req, res) => {
    const { page, limit, skip, sort } = getPagination(req);
    const filter: Record<string, unknown> = {};
    if (req.query.status) filter.status = req.query.status;
    if (req.query.q) {
      const q = String(req.query.q).trim();
      if (q) {
        filter.$or = [
          { titleEn: new RegExp(q, 'i') },
          { titleHi: new RegExp(q, 'i') },
          { city: new RegExp(q, 'i') },
          { skills: new RegExp(q, 'i') },
        ];
      }
    }

    const [items, total] = await Promise.all([
      Job.find(filter)
        .sort(sort)
        .skip(skip)
        .limit(limit)
        .populate('employerProfileId', 'companyName city ownerName')
        .populate('categoryId', 'nameEn nameHi slug')
        .lean(),
      Job.countDocuments(filter),
    ]);

    sendSuccess(res, items, 'Jobs', 200, paginationMeta(total, page, limit));
  }),
);

router.get(
  '/jobs/:id',
  asyncHandler(async (req, res) => {
    if (!mongoose.isValidObjectId(req.params.id)) throw Errors.badRequest('Invalid job id');

    const job = await Job.findById(req.params.id)
      .populate('employerProfileId', 'companyName city ownerName contactMobile contactEmail logoUrl')
      .populate('categoryId', 'nameEn nameHi slug')
      .populate('subcategoryId', 'nameEn nameHi slug')
      .lean();
    if (!job) throw Errors.notFound('Job not found');

    const applications = await JobApplication.find({ jobId: job._id })
      .sort({ createdAt: -1 })
      .limit(200)
      .populate('seekerProfileId')
      .populate('seekerId', 'mobile email status')
      .lean();

    const statusBreakdown = await JobApplication.aggregate([
      { $match: { jobId: job._id } },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]);

    sendSuccess(
      res,
      {
        job,
        applications,
        counts: {
          applications: applications.length,
          totalApplications: statusBreakdown.reduce((sum, row) => sum + (row.count as number), 0),
          byStatus: statusBreakdown.map((row) => ({
            status: String(row._id || 'unknown'),
            count: row.count as number,
          })),
          views: job.viewsCount ?? 0,
        },
      },
      'Job details',
    );
  }),
);

router.post(
  '/jobs/:id/approve',
  asyncHandler(async (req, res) => {
    const job = await Job.findByIdAndUpdate(
      req.params.id,
      {
        $set: {
          status: JOB_STATUS.PUBLISHED,
          approvedBy: req.user!.id,
          approvedAt: new Date(),
          publishedAt: new Date(),
        },
      },
      { new: true },
    );
    if (!job) throw Errors.notFound('Job not found');
    void notifyJobApproved({
      employerUserId: String(job.employerId),
      jobTitle: job.titleEn,
    });
    sendSuccess(res, job, 'Job approved');
  }),
);

router.post(
  '/jobs/:id/reject',
  validate(z.object({ rejectionReason: z.string().min(3) })),
  asyncHandler(async (req, res) => {
    const job = await Job.findByIdAndUpdate(
      req.params.id,
      {
        $set: {
          status: JOB_STATUS.REJECTED,
          rejectionReason: req.body.rejectionReason,
          approvedBy: req.user!.id,
          approvedAt: new Date(),
        },
      },
      { new: true },
    );
    if (!job) throw Errors.notFound('Job not found');
    void notifyJobRejected({
      employerUserId: String(job.employerId),
      jobTitle: job.titleEn,
      reason: req.body.rejectionReason,
    });
    sendSuccess(res, job, 'Job rejected');
  }),
);

router.delete(
  '/jobs/:id',
  asyncHandler(async (req, res) => {
    const job = await Job.findByIdAndUpdate(
      req.params.id,
      { $set: { status: JOB_STATUS.CLOSED } },
      { new: true },
    );
    if (!job) throw Errors.notFound('Job not found');
    sendSuccess(res, job, 'Job closed');
  }),
);

router.get(
  '/expenditures',
  asyncHandler(async (req, res) => {
    const { page, limit, skip, sort } = getPagination(req);
    const scope = String(req.query.scope || 'employer'); // employer | employee
    const filter: Record<string, unknown> = {};

    if (scope === 'employee') {
      filter.employeeId = { $exists: true, $ne: null };
    } else {
      filter.$or = [{ employeeId: { $exists: false } }, { employeeId: null }];
    }

    if (req.query.employerId && mongoose.isValidObjectId(String(req.query.employerId))) {
      filter.employerId = new mongoose.Types.ObjectId(String(req.query.employerId));
    }
    if (
      scope === 'employee' &&
      req.query.employeeId &&
      mongoose.isValidObjectId(String(req.query.employeeId))
    ) {
      filter.employeeId = new mongoose.Types.ObjectId(String(req.query.employeeId));
    }
    if (req.query.category) filter.category = req.query.category;
    if (req.query.type) filter.type = req.query.type;

    const [items, total, typeTotals, byCategory] = await Promise.all([
      Expenditure.find(filter)
        .sort(sort)
        .skip(skip)
        .limit(limit)
        .populate('employerProfileId', 'companyName companyNameHi city')
        .populate('employeeId', 'fullName mobile designation employerId')
        .lean(),
      Expenditure.countDocuments(filter),
      Expenditure.aggregate([
        { $match: filter },
        { $group: { _id: '$type', total: { $sum: '$amount' }, count: { $sum: 1 } } },
      ]),
      Expenditure.aggregate([
        { $match: filter },
        {
          $group: {
            _id: { category: '$category', type: '$type' },
            total: { $sum: '$amount' },
            count: { $sum: 1 },
          },
        },
        { $sort: { total: -1 } },
        { $limit: 12 },
      ]),
    ]);

    const credit = typeTotals.find((row) => row._id === 'credit')?.total ?? 0;
    const debit = typeTotals.find((row) => row._id === 'debit')?.total ?? 0;

    sendSuccess(
      res,
      {
        items,
        summary: {
          credit,
          debit,
          balance: credit - debit,
          count: total,
          byCategory: byCategory.map((row) => ({
            category: String(row._id?.category || 'other'),
            type: String(row._id?.type || 'debit'),
            total: row.total as number,
            count: row.count as number,
          })),
        },
      },
      'Expenditures',
      200,
      paginationMeta(total, page, limit),
    );
  }),
);

export default router;
