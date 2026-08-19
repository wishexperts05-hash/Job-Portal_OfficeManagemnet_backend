import mongoose from 'mongoose';
import { Router } from 'express';
import { JobSeekerProfile, JobApplication, User } from '../../models/index.ts';
import { ACCOUNT_TYPES, USER_STATUS } from '../../constants/index.ts';
import { asyncHandler } from '../../utils/asyncHandler.ts';
import { sendSuccess } from '../../utils/ApiResponse.ts';
import { authenticate, authorize } from '../../middlewares/auth.ts';
import { Errors } from '../../utils/ApiError.ts';
import { getPagination, paginationMeta } from '../../utils/pagination.ts';

const router = Router();

// Candidate search is a paid-side feature: employers only, never public.
router.use(authenticate, authorize(ACCOUNT_TYPES.EMPLOYER, ACCOUNT_TYPES.ADMIN));

/** Card-level fields. Mobile and email are deliberately excluded — see GET /talent/:userId. */
const CARD_FIELDS = {
  userId: 1,
  fullName: 1,
  fullNameHi: 1,
  headline: 1,
  photoUrl: 1,
  city: 1,
  district: 1,
  state: 1,
  skills: 1,
  languages: 1,
  experienceYears: 1,
  experienceMonths: 1,
  highestQualification: 1,
  currentSalary: 1,
  expectedSalary: 1,
  noticePeriodDays: 1,
  preferredCities: 1,
  preferredEmploymentType: 1,
  willingToRelocate: 1,
  resumeUrl: 1,
  summary: 1,
  updatedAt: 1,
  createdAt: 1,
} as const;

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Only discoverable candidates: an active account with a finished registration. */
const ACTIVE_SEEKER_MATCH = {
  'user.accountType': ACCOUNT_TYPES.JOB_SEEKER,
  'user.status': USER_STATUS.ACTIVE,
};

function buildProfileFilter(query: Record<string, unknown>) {
  const filter: Record<string, unknown> = { registrationCompleted: true };
  const and: Record<string, unknown>[] = [];

  const q = typeof query.q === 'string' ? query.q.trim() : '';
  if (q) {
    const rx = new RegExp(escapeRegex(q), 'i');
    and.push({
      $or: [
        { fullName: rx },
        { fullNameHi: rx },
        { headline: rx },
        { summary: rx },
        { city: rx },
        { skills: rx },
        { 'experience.designation': rx },
        { 'experience.companyName': rx },
      ],
    });
  }

  if (query.city) {
    filter.city = new RegExp(escapeRegex(String(query.city)), 'i');
  }

  // Every requested skill must be present, so stacking skills narrows the list.
  const skills = String(query.skills || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  for (const skill of skills) {
    and.push({ skills: new RegExp(escapeRegex(skill), 'i') });
  }

  const experienceMin = Number(query.experienceMin);
  if (!Number.isNaN(experienceMin) && String(query.experienceMin ?? '') !== '') {
    filter.experienceYears = { $gte: experienceMin };
  }
  const experienceMax = Number(query.experienceMax);
  if (!Number.isNaN(experienceMax) && String(query.experienceMax ?? '') !== '') {
    filter.experienceYears = {
      ...((filter.experienceYears as Record<string, number>) ?? {}),
      $lte: experienceMax,
    };
  }

  // Budget filter: keep candidates who ask for no more than this, plus those who did not say.
  const salaryMax = Number(query.salaryMax);
  if (!Number.isNaN(salaryMax) && salaryMax > 0) {
    and.push({
      $or: [{ expectedSalary: { $lte: salaryMax } }, { expectedSalary: { $in: [null, 0] } }],
    });
  }

  if (query.employmentType) filter.preferredEmploymentType = String(query.employmentType);
  if (query.qualification) filter.highestQualification = String(query.qualification);
  if (query.gender) filter.gender = String(query.gender);
  if (query.relocate === 'true') filter.willingToRelocate = true;
  if (query.hasResume === 'true') filter.resumeUrl = { $exists: true, $nin: [null, ''] };

  if (query.categoryId && mongoose.isValidObjectId(String(query.categoryId))) {
    filter.preferredJobCategories = new mongoose.Types.ObjectId(String(query.categoryId));
  }

  if (and.length) filter.$and = and;
  return filter;
}

const SORTABLE = new Set(['createdAt', 'updatedAt', 'experienceYears', 'expectedSalary', 'fullName']);

/** City and skill options for the filter bar, counted from the discoverable pool. */
router.get(
  '/meta',
  asyncHandler(async (_req, res) => {
    const base = [
      { $match: { registrationCompleted: true } },
      {
        $lookup: { from: 'users', localField: 'userId', foreignField: '_id', as: 'user' },
      },
      { $unwind: '$user' },
      { $match: ACTIVE_SEEKER_MATCH },
    ];

    const [cities, skills, total] = await Promise.all([
      JobSeekerProfile.aggregate([
        ...base,
        { $match: { city: { $nin: [null, ''] } } },
        { $group: { _id: '$city', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 12 },
      ]),
      JobSeekerProfile.aggregate([
        ...base,
        { $unwind: '$skills' },
        { $group: { _id: '$skills', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 24 },
      ]),
      JobSeekerProfile.aggregate([...base, { $count: 'count' }]),
    ]);

    sendSuccess(
      res,
      {
        cities: cities.map((row) => ({ value: String(row._id), count: row.count as number })),
        skills: skills.map((row) => ({ value: String(row._id), count: row.count as number })),
        total: (total[0]?.count as number) ?? 0,
      },
      'Talent filters',
    );
  }),
);

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const { page, limit, skip, sort } = getPagination(req, 12, 60);
    const sortKey = Object.keys(sort)[0]!;
    const safeSort = SORTABLE.has(sortKey) ? sort : { updatedAt: -1 as const };

    const [result] = await JobSeekerProfile.aggregate([
      { $match: buildProfileFilter(req.query as Record<string, unknown>) },
      { $lookup: { from: 'users', localField: 'userId', foreignField: '_id', as: 'user' } },
      { $unwind: '$user' },
      { $match: ACTIVE_SEEKER_MATCH },
      {
        $facet: {
          items: [{ $sort: safeSort }, { $skip: skip }, { $limit: limit }, { $project: CARD_FIELDS }],
          total: [{ $count: 'count' }],
        },
      },
    ]);

    const items = (result?.items ?? []) as Array<Record<string, unknown>>;
    const total = (result?.total?.[0]?.count as number) ?? 0;

    sendSuccess(res, items, 'Candidates', 200, paginationMeta(total, page, limit));
  }),
);

/**
 * Full candidate record including contact details. Kept separate from the list so a
 * browsing employer has to open a profile before phone numbers are exposed.
 */
router.get(
  '/:userId',
  asyncHandler(async (req, res) => {
    const userId = String(req.params.userId);
    if (!mongoose.isValidObjectId(userId)) throw Errors.badRequest('Invalid candidate id');

    const user = await User.findOne({
      _id: userId,
      accountType: ACCOUNT_TYPES.JOB_SEEKER,
      status: USER_STATUS.ACTIVE,
    })
      .select('mobile email preferredLocale status createdAt')
      .lean();
    if (!user) throw Errors.notFound('Candidate not found');

    const profile = await JobSeekerProfile.findOne({ userId, registrationCompleted: true })
      .populate('preferredJobCategories', 'nameEn nameHi slug')
      .lean();
    if (!profile) throw Errors.notFound('Candidate profile not available');

    // Whether this candidate has already applied to one of the viewing employer's jobs.
    const appliedToMine =
      req.user!.accountType === ACCOUNT_TYPES.EMPLOYER
        ? await JobApplication.countDocuments({ seekerId: userId, employerId: req.user!.id })
        : 0;

    sendSuccess(res, { user, profile, appliedToMine }, 'Candidate details');
  }),
);

export default router;
