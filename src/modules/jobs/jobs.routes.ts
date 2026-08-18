import { z } from 'zod';
import { Router } from 'express';
import {
  Job,
  EmployerProfile,
  JobApplication,
  JobSeekerProfile,
  EmployerSubscription,
  SubscriptionPlan,
} from '../../models/index.js';
import { ACCOUNT_TYPES, JOB_STATUS, SUBSCRIPTION_STATUS } from '../../constants/index.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { sendSuccess, sendCreated } from '../../utils/ApiResponse.js';
import { validate } from '../../middlewares/validate.js';
import { authenticate, authorize, optionalAuth } from '../../middlewares/auth.js';
import { Errors } from '../../utils/ApiError.js';
import { getPagination, paginationMeta } from '../../utils/pagination.js';
import { notifyJobApplication, notifyAdminsJobPendingApproval } from '../../services/notify.service.js';

const router = Router();

const jobBodySchema = z.object({
  titleEn: z.string().min(3),
  titleHi: z.string().min(1),
  descriptionEn: z.string().min(10),
  descriptionHi: z.string().min(1),
  categoryId: z.string(),
  subcategoryId: z.string().optional(),
  employmentType: z
    .enum(['full_time', 'part_time', 'contract', 'temporary', 'internship'])
    .optional(),
  experienceMin: z.number().optional(),
  experienceMax: z.number().optional(),
  salaryMin: z.number().optional(),
  salaryMax: z.number().optional(),
  salaryType: z.enum(['monthly', 'daily', 'hourly', 'yearly']).optional(),
  vacancies: z.number().min(1).optional(),
  city: z.string().min(2),
  state: z.string().optional(),
  locationText: z.string().optional(),
  skills: z.array(z.string()).optional(),
  submitForApproval: z.boolean().optional().default(true),
});

async function assertCanPostJob(employerId: string) {
  const sub = await EmployerSubscription.findOne({
    employerId,
    status: { $in: [SUBSCRIPTION_STATUS.ACTIVE, SUBSCRIPTION_STATUS.TRIAL] },
  }).sort({ createdAt: -1 });

  if (!sub) {
    // Launch phase fallback: allow posting
    return { unlimited: true as const };
  }

  const plan = await SubscriptionPlan.findById(sub.planId);
  if (!plan) return { unlimited: true as const };

  if (plan.jobPostLimit !== -1 && sub.jobsPostedCount >= plan.jobPostLimit) {
    throw Errors.forbidden('Job posting limit reached for your subscription plan');
  }

  return { sub, plan, unlimited: false as const };
}

router.get(
  '/',
  optionalAuth,
  asyncHandler(async (req, res) => {
    const { page, limit, skip, sort } = getPagination(req);
    const filter: Record<string, unknown> = { status: JOB_STATUS.PUBLISHED };

    if (req.query.city) filter.city = new RegExp(String(req.query.city), 'i');
    if (req.query.categoryId) filter.categoryId = req.query.categoryId;
    if (req.query.subcategoryId) filter.subcategoryId = req.query.subcategoryId;
    if (req.query.employmentType) filter.employmentType = req.query.employmentType;
    if (req.query.q) {
      filter.$text = { $search: String(req.query.q) };
    }

    const [items, total] = await Promise.all([
      Job.find(filter)
        .sort(sort)
        .skip(skip)
        .limit(limit)
        .populate('employerProfileId', 'companyName companyNameHi city logoUrl')
        .populate('categoryId', 'nameEn nameHi slug')
        .lean(),
      Job.countDocuments(filter),
    ]);

    sendSuccess(res, items, 'Jobs fetched', 200, paginationMeta(total, page, limit));
  }),
);

router.get(
  '/mine',
  authenticate,
  authorize(ACCOUNT_TYPES.EMPLOYER),
  asyncHandler(async (req, res) => {
    const { page, limit, skip, sort } = getPagination(req);
    const filter: Record<string, unknown> = { employerId: req.user!.id };
    if (req.query.status) filter.status = req.query.status;

    const [items, total] = await Promise.all([
      Job.find(filter).sort(sort).skip(skip).limit(limit).lean(),
      Job.countDocuments(filter),
    ]);

    sendSuccess(res, items, 'Employer jobs', 200, paginationMeta(total, page, limit));
  }),
);

router.get(
  '/applications/mine',
  authenticate,
  authorize(ACCOUNT_TYPES.JOB_SEEKER),
  asyncHandler(async (req, res) => {
    const { page, limit, skip } = getPagination(req);

    const [items, total] = await Promise.all([
      JobApplication.find({ seekerId: req.user!.id })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate({
          path: 'jobId',
          select: 'titleEn titleHi city state salaryMin salaryMax salaryType status employerProfileId',
          populate: { path: 'employerProfileId', select: 'companyName companyNameHi logoUrl city' },
        })
        .lean(),
      JobApplication.countDocuments({ seekerId: req.user!.id }),
    ]);

    sendSuccess(res, items, 'My applications', 200, paginationMeta(total, page, limit));
  }),
);

router.get(
  '/:id',
  optionalAuth,
  asyncHandler(async (req, res) => {
    const job = await Job.findById(req.params.id)
      .populate('employerProfileId', 'companyName companyNameHi city logoUrl description')
      .populate('categoryId', 'nameEn nameHi')
      .lean();
    if (!job) throw Errors.notFound('Job not found');

    if (
      job.status !== JOB_STATUS.PUBLISHED &&
      req.user?.accountType !== ACCOUNT_TYPES.ADMIN &&
      req.user?.id !== String(job.employerId)
    ) {
      throw Errors.forbidden('Job not available');
    }

    await Job.updateOne({ _id: job._id }, { $inc: { viewsCount: 1 } });

    let hasApplied = false;
    if (req.user?.accountType === ACCOUNT_TYPES.JOB_SEEKER) {
      const existing = await JobApplication.exists({
        jobId: job._id,
        seekerId: req.user.id,
      });
      hasApplied = !!existing;
    }

    sendSuccess(res, { ...job, hasApplied }, 'Job details');
  }),
);

router.post(
  '/',
  authenticate,
  authorize(ACCOUNT_TYPES.EMPLOYER),
  validate(jobBodySchema),
  asyncHandler(async (req, res) => {
    const profile = await EmployerProfile.findOne({ userId: req.user!.id });
    if (!profile?.registrationCompleted) {
      throw Errors.forbidden('Complete employer registration first');
    }

    const limitInfo = await assertCanPostJob(req.user!.id);
    const { submitForApproval, ...rest } = req.body;

    const job = await Job.create({
      ...rest,
      employerId: req.user!.id,
      employerProfileId: profile._id,
      status: submitForApproval ? JOB_STATUS.PENDING_APPROVAL : JOB_STATUS.DRAFT,
      skills: rest.skills ?? [],
    });

    if (!limitInfo.unlimited && limitInfo.sub) {
      await EmployerSubscription.updateOne(
        { _id: limitInfo.sub._id },
        { $inc: { jobsPostedCount: 1 } },
      );
    }

    if (job.status === JOB_STATUS.PENDING_APPROVAL) {
      void notifyAdminsJobPendingApproval({
        jobId: String(job._id),
        jobTitle: job.titleEn,
        companyName: profile.companyName,
      });
    }

    sendCreated(res, job, 'Job created');
  }),
);

router.patch(
  '/:id',
  authenticate,
  authorize(ACCOUNT_TYPES.EMPLOYER, ACCOUNT_TYPES.ADMIN),
  validate(jobBodySchema.partial()),
  asyncHandler(async (req, res) => {
    const job = await Job.findById(req.params.id);
    if (!job) throw Errors.notFound('Job not found');

    if (
      req.user!.accountType === ACCOUNT_TYPES.EMPLOYER &&
      String(job.employerId) !== req.user!.id
    ) {
      throw Errors.forbidden();
    }

    Object.assign(job, req.body);
    const submittedForApproval = Boolean(req.body.submitForApproval);
    if (submittedForApproval) {
      job.status = JOB_STATUS.PENDING_APPROVAL;
    }
    await job.save();

    if (submittedForApproval) {
      const company =
        (await EmployerProfile.findById(job.employerProfileId).select('companyName').lean())
          ?.companyName || undefined;
      void notifyAdminsJobPendingApproval({
        jobId: String(job._id),
        jobTitle: job.titleEn,
        companyName: company,
      });
    }

    sendSuccess(res, job, 'Job updated');
  }),
);

router.post(
  '/:id/close',
  authenticate,
  authorize(ACCOUNT_TYPES.EMPLOYER, ACCOUNT_TYPES.ADMIN),
  asyncHandler(async (req, res) => {
    const job = await Job.findById(req.params.id);
    if (!job) throw Errors.notFound('Job not found');

    if (
      req.user!.accountType === ACCOUNT_TYPES.EMPLOYER &&
      String(job.employerId) !== req.user!.id
    ) {
      throw Errors.forbidden();
    }

    if (job.status === JOB_STATUS.CLOSED) {
      throw Errors.conflict('Job is already closed');
    }

    if (
      job.status !== JOB_STATUS.PUBLISHED &&
      job.status !== JOB_STATUS.PENDING_APPROVAL &&
      job.status !== JOB_STATUS.DRAFT
    ) {
      throw Errors.badRequest('Only open jobs can be closed');
    }

    job.status = JOB_STATUS.CLOSED;
    await job.save();
    sendSuccess(res, job, 'Job closed');
  }),
);

router.post(
  '/:id/apply',
  authenticate,
  authorize(ACCOUNT_TYPES.JOB_SEEKER),
  validate(
    z.object({
      coverNote: z.string().optional(),
      resumeUrl: z.string().url().optional(),
    }),
  ),
  asyncHandler(async (req, res) => {
    const job = await Job.findById(req.params.id);
    if (!job || job.status !== JOB_STATUS.PUBLISHED) {
      throw Errors.notFound('Job not available');
    }

    const seekerProfile = await JobSeekerProfile.findOne({ userId: req.user!.id });
    if (!seekerProfile?.registrationCompleted) {
      throw Errors.forbidden('Complete job seeker registration first');
    }

    const alreadyApplied = await JobApplication.findOne({
      jobId: job._id,
      seekerId: req.user!.id,
    });
    if (alreadyApplied) {
      throw Errors.conflict('You have already applied to this job');
    }

    const application = await JobApplication.create({
      jobId: job._id,
      seekerId: req.user!.id,
      seekerProfileId: seekerProfile._id,
      employerId: job.employerId,
      coverNote: req.body.coverNote,
      resumeUrl: req.body.resumeUrl ?? seekerProfile.resumeUrl,
    });

    await Job.updateOne({ _id: job._id }, { $inc: { applicationsCount: 1 } });

    void notifyJobApplication({
      employerUserId: String(job.employerId),
      jobTitle: job.titleEn,
      seekerName: seekerProfile.fullName,
    });

    sendCreated(res, application, 'Applied successfully');
  }),
);

router.get(
  '/:id/applications',
  authenticate,
  authorize(ACCOUNT_TYPES.EMPLOYER, ACCOUNT_TYPES.ADMIN),
  asyncHandler(async (req, res) => {
    const job = await Job.findById(req.params.id);
    if (!job) throw Errors.notFound('Job not found');
    if (
      req.user!.accountType === ACCOUNT_TYPES.EMPLOYER &&
      String(job.employerId) !== req.user!.id
    ) {
      throw Errors.forbidden();
    }

    const apps = await JobApplication.find({ jobId: job._id })
      .populate('seekerProfileId')
      .populate('seekerId', 'mobile email preferredLocale status')
      .sort({ createdAt: -1 })
      .lean();

    // Mark as viewed when employer opens the list
    await JobApplication.updateMany(
      { jobId: job._id, status: 'applied' },
      { $set: { status: 'viewed' } },
    );

    sendSuccess(res, apps, 'Applications');
  }),
);

router.get(
  '/:id/applications/:applicationId',
  authenticate,
  authorize(ACCOUNT_TYPES.EMPLOYER, ACCOUNT_TYPES.ADMIN),
  asyncHandler(async (req, res) => {
    const job = await Job.findById(req.params.id);
    if (!job) throw Errors.notFound('Job not found');
    if (
      req.user!.accountType === ACCOUNT_TYPES.EMPLOYER &&
      String(job.employerId) !== req.user!.id
    ) {
      throw Errors.forbidden();
    }

    const application = await JobApplication.findOne({
      _id: req.params.applicationId,
      jobId: job._id,
    })
      .populate('seekerProfileId')
      .populate('seekerId', 'mobile email preferredLocale status')
      .lean();

    if (!application) throw Errors.notFound('Application not found');

    if (application.status === 'applied') {
      await JobApplication.updateOne(
        { _id: application._id },
        { $set: { status: 'viewed' } },
      );
      application.status = 'viewed';
    }

    sendSuccess(res, application, 'Application details');
  }),
);

export default router;
