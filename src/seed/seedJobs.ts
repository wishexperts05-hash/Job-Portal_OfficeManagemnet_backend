/**
 * Seed many published jobs across all categories for every active employer.
 * Usage: pnpm seed:jobs
 * Optional: CLEAR_JOBS=1 pnpm seed:jobs  (wipes existing jobs first)
 */
import { connectMongo } from '../config/db.ts';
import {
  User,
  EmployerProfile,
  JobCategory,
  Job,
} from '../models/index.ts';
import { ACCOUNT_TYPES, JOB_STATUS, USER_STATUS } from '../constants/index.ts';
import type { Types } from 'mongoose';

const CITIES = [
  { city: 'Tirupur', state: 'Tamil Nadu' },
  { city: 'Ludhiana', state: 'Punjab' },
  { city: 'Surat', state: 'Gujarat' },
  { city: 'Kanpur', state: 'Uttar Pradesh' },
  { city: 'Coimbatore', state: 'Tamil Nadu' },
  { city: 'Ahmedabad', state: 'Gujarat' },
  { city: 'Delhi', state: 'Delhi' },
  { city: 'Bengaluru', state: 'Karnataka' },
  { city: 'Jaipur', state: 'Rajasthan' },
  { city: 'Indore', state: 'Madhya Pradesh' },
];

const EMPLOYMENT_TYPES = ['full_time', 'part_time', 'contract', 'temporary'] as const;

const ROLE_VARIANTS: Array<{ en: string; hi: string; skills: string[] }> = [
  { en: 'Junior', hi: 'जूनियर', skills: ['basic', 'teamwork'] },
  { en: 'Senior', hi: 'सीनियर', skills: ['leadership', 'quality'] },
  { en: 'Shift', hi: 'शिफ्ट', skills: ['night-shift', 'production'] },
];

type DraftJob = {
  titleEn: string;
  titleHi: string;
  categoryId: Types.ObjectId;
  subcategoryId?: Types.ObjectId;
  skills: string[];
  experienceMin: number;
  experienceMax: number;
  salaryMin: number;
  salaryMax: number;
  vacancies: number;
  categoryNameEn: string;
};

function buildDescription(titleEn: string, categoryEn: string, company: string) {
  return {
    descriptionEn: `${company} is hiring for ${titleEn} in the ${categoryEn} department. Candidates should have relevant hosiery/textile experience, be ready for factory floor work, and follow quality & safety standards. Freshers with strong willingness to learn may also apply for junior roles.`,
    descriptionHi: `${company} ${categoryEn} विभाग में ${titleEn} पद के लिए भर्ती कर रहा/रही है। होज़री/टेक्सटाइल अनुभव, फैक्टरी वर्क और क्वालिटी मानकों का पालन आवश्यक है। जूनियर पदों के लिए सीखने के इच्छुक नए उम्मीदवार भी आवेदन कर सकते हैं।`,
  };
}

async function seedJobs() {
  await connectMongo();

  if (process.env.CLEAR_JOBS === '1') {
    const deleted = await Job.deleteMany({});
    console.log(`[seed:jobs] cleared ${deleted.deletedCount} existing jobs`);
  }

  const employers = await User.find({
    accountType: ACCOUNT_TYPES.EMPLOYER,
    status: USER_STATUS.ACTIVE,
  }).lean();

  if (!employers.length) {
    console.error('[seed:jobs] no active employers found — register at least one employer first');
    process.exit(1);
  }

  const profiles = await EmployerProfile.find({
    userId: { $in: employers.map((e) => e._id) },
  }).lean();
  const profileByUser = new Map(profiles.map((p) => [String(p.userId), p]));

  const employersWithProfile = employers.filter((e) => profileByUser.has(String(e._id)));
  if (!employersWithProfile.length) {
    console.error('[seed:jobs] employers exist but none have a company profile');
    process.exit(1);
  }

  const parents = await JobCategory.find({ parentId: null, isActive: true })
    .sort({ sortOrder: 1 })
    .lean();
  if (!parents.length) {
    console.error('[seed:jobs] no categories found — run pnpm seed first');
    process.exit(1);
  }

  const children = await JobCategory.find({
    parentId: { $in: parents.map((p) => p._id) },
    isActive: true,
  })
    .sort({ sortOrder: 1 })
    .lean();

  const childrenByParent = new Map<string, typeof children>();
  for (const child of children) {
    const key = String(child.parentId);
    const list = childrenByParent.get(key) || [];
    list.push(child);
    childrenByParent.set(key, list);
  }

  console.log(
    `[seed:jobs] employers=${employersWithProfile.length}, categories=${parents.length}, subcategories=${children.length}`,
  );

  const drafts: DraftJob[] = [];

  for (const parent of parents) {
    const subs = childrenByParent.get(String(parent._id)) || [];
    const baseRoles =
      subs.length > 0
        ? subs.map((s) => ({
            titleEn: s.nameEn,
            titleHi: s.nameHi,
            subcategoryId: s._id as Types.ObjectId,
            skills: [s.slug.replace(/-/g, ' '), parent.slug.replace(/-/g, ' ')],
          }))
        : [
            {
              titleEn: `${parent.nameEn} Operator`,
              titleHi: `${parent.nameHi} ऑपरेटर`,
              subcategoryId: undefined as Types.ObjectId | undefined,
              skills: [parent.slug.replace(/-/g, ' ')],
            },
          ];

    for (let r = 0; r < baseRoles.length; r++) {
      const role = baseRoles[r]!;
      drafts.push({
        titleEn: role.titleEn,
        titleHi: role.titleHi,
        categoryId: parent._id as Types.ObjectId,
        subcategoryId: role.subcategoryId,
        skills: role.skills,
        experienceMin: r % 3,
        experienceMax: 2 + (r % 5),
        salaryMin: 10000 + (r % 4) * 2500,
        salaryMax: 16000 + (r % 4) * 4000,
        vacancies: 1 + (r % 5),
        categoryNameEn: parent.nameEn,
      });

      // Extra variants so every category has more than one posting style
      if (r < 2) {
        const variantCount = r === 0 ? 2 : 1;
        for (const variant of ROLE_VARIANTS.slice(0, variantCount)) {
          drafts.push({
            titleEn: `${variant.en} ${role.titleEn}`,
            titleHi: `${variant.hi} ${role.titleHi}`,
            categoryId: parent._id as Types.ObjectId,
            subcategoryId: role.subcategoryId,
            skills: [...role.skills, ...variant.skills],
            experienceMin: variant.en === 'Senior' ? 3 : 0,
            experienceMax: variant.en === 'Senior' ? 8 : 3,
            salaryMin: variant.en === 'Senior' ? 22000 : 11000,
            salaryMax: variant.en === 'Senior' ? 35000 : 18000,
            vacancies: variant.en === 'Shift' ? 4 : 2,
            categoryNameEn: parent.nameEn,
          });
        }
      }
    }
  }

  const docs: Array<Record<string, unknown>> = [];
  let featuredCount = 0;
  const featuredCategorySeen = new Set<string>();

  for (let i = 0; i < drafts.length; i++) {
    const draft = drafts[i]!;
    const employer = employersWithProfile[i % employersWithProfile.length]!;
    const profile = profileByUser.get(String(employer._id))!;
    const loc = CITIES[i % CITIES.length]!;
    const companyName = profile.companyName || 'Textile Unit';
    const desc = buildDescription(draft.titleEn, draft.categoryNameEn, companyName);
    const now = new Date();
    const catKey = String(draft.categoryId);
    const isFeatured =
      !featuredCategorySeen.has(catKey) && featuredCount < Math.min(12, parents.length);

    if (isFeatured) {
      featuredCategorySeen.add(catKey);
      featuredCount += 1;
    }

    docs.push({
      employerId: employer._id,
      employerProfileId: profile._id,
      titleEn: draft.titleEn,
      titleHi: draft.titleHi,
      descriptionEn: desc.descriptionEn,
      descriptionHi: desc.descriptionHi,
      categoryId: draft.categoryId,
      subcategoryId: draft.subcategoryId,
      employmentType: EMPLOYMENT_TYPES[i % EMPLOYMENT_TYPES.length],
      experienceMin: draft.experienceMin,
      experienceMax: draft.experienceMax,
      salaryMin: draft.salaryMin,
      salaryMax: draft.salaryMax,
      salaryType: 'monthly',
      vacancies: draft.vacancies,
      city: profile.city || loc.city,
      state: profile.state || loc.state,
      locationText: `${profile.city || loc.city}, ${profile.state || loc.state}`,
      skills: draft.skills,
      status: JOB_STATUS.PUBLISHED,
      publishedAt: now,
      approvedAt: now,
      expiresAt: new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000),
      viewsCount: Math.floor(Math.random() * 80),
      applicationsCount: 0,
      isFeatured,
    });
  }

  const BATCH = 100;
  let inserted = 0;
  for (let i = 0; i < docs.length; i += BATCH) {
    const chunk = docs.slice(i, i + BATCH);
    await Job.insertMany(chunk, { ordered: false });
    inserted += chunk.length;
    console.log(`[seed:jobs] inserted ${inserted}/${docs.length}`);
  }

  const byCategory = await Job.aggregate([
    { $match: { status: JOB_STATUS.PUBLISHED } },
    { $group: { _id: '$categoryId', count: { $sum: 1 } } },
  ]);

  console.log(
    `[seed:jobs] done — ${inserted} jobs published across ${byCategory.length} categories for ${employersWithProfile.length} employers`,
  );
  console.log(`[seed:jobs] featured jobs: ${featuredCount}`);
  process.exit(0);
}

seedJobs().catch((err) => {
  console.error('[seed:jobs] failed', err);
  process.exit(1);
});
