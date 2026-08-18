import { z } from 'zod';
import { Router } from 'express';
import mongoose from 'mongoose';
import { JobCategory } from '../../models/index.ts';
import { ACCOUNT_TYPES } from '../../constants/index.ts';
import { asyncHandler } from '../../utils/asyncHandler.ts';
import { sendSuccess, sendCreated } from '../../utils/ApiResponse.ts';
import { validate } from '../../middlewares/validate.ts';
import { authenticate, authorize } from '../../middlewares/auth.ts';
import { Errors } from '../../utils/ApiError.ts';
import { getRedis, cacheKeys } from '../../config/redis.ts';
import { getPagination, paginationMeta } from '../../utils/pagination.ts';

const router = Router();

function slugify(text: string) {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

async function invalidateCategoryCache() {
  await getRedis().del(cacheKeys.categories);
}

const categoryBodySchema = z.object({
  nameEn: z.string().min(2),
  nameHi: z.string().min(1),
  parentId: z.string().optional().nullable(),
  descriptionEn: z.string().optional().nullable(),
  descriptionHi: z.string().optional().nullable(),
  iconUrl: z.string().url().optional().nullable().or(z.literal('')),
  sortOrder: z.number().optional(),
  slug: z.string().optional(),
  isActive: z.boolean().optional(),
});

router.get(
  '/',
  asyncHandler(async (_req, res) => {
    const redis = getRedis();
    const cached = await redis.get(cacheKeys.categories);
    if (cached) {
      sendSuccess(res, JSON.parse(cached), 'Categories');
      return;
    }

    const categories = await JobCategory.find({ isActive: true }).sort({ sortOrder: 1 }).lean();
    const roots = categories.filter((c) => !c.parentId);
    const tree = roots.map((root) => ({
      ...root,
      subcategories: categories.filter(
        (c) => c.parentId && String(c.parentId) === String(root._id),
      ),
    }));

    await redis.set(cacheKeys.categories, JSON.stringify(tree), 'EX', 600);
    sendSuccess(res, tree, 'Categories');
  }),
);

/** Admin: paginated parent categories with nested subcategories */
router.get(
  '/manage',
  authenticate,
  authorize(ACCOUNT_TYPES.ADMIN),
  asyncHandler(async (req, res) => {
    const { page, limit, skip, sort } = getPagination(req, 10, 50);
    const filter: Record<string, unknown> = { parentId: null };
    if (req.query.status === 'active') filter.isActive = true;
    if (req.query.status === 'inactive') filter.isActive = false;
    if (req.query.q) {
      const q = String(req.query.q).trim();
      if (q) {
        filter.$or = [
          { nameEn: new RegExp(q, 'i') },
          { nameHi: new RegExp(q, 'i') },
          { slug: new RegExp(q, 'i') },
        ];
      }
    }

    const [roots, total] = await Promise.all([
      JobCategory.find(filter).sort(sort).skip(skip).limit(limit).lean(),
      JobCategory.countDocuments(filter),
    ]);

    const rootIds = roots.map((r) => r._id);
    const children = await JobCategory.find({ parentId: { $in: rootIds } })
      .sort({ sortOrder: 1, nameEn: 1 })
      .lean();

    const items = roots.map((root) => ({
      ...root,
      subcategories: children.filter((c) => String(c.parentId) === String(root._id)),
    }));

    // Flat parent list for dropdowns (all active/inactive parents)
    const allParents = await JobCategory.find({ parentId: null })
      .sort({ sortOrder: 1, nameEn: 1 })
      .select('nameEn nameHi isActive')
      .lean();

    sendSuccess(res, { items, parents: allParents }, 'Categories', 200, paginationMeta(total, page, limit));
  }),
);

router.get(
  '/:id',
  authenticate,
  authorize(ACCOUNT_TYPES.ADMIN),
  asyncHandler(async (req, res) => {
    if (!mongoose.isValidObjectId(req.params.id)) throw Errors.badRequest('Invalid category id');
    const category = await JobCategory.findById(req.params.id).lean();
    if (!category) throw Errors.notFound('Category not found');
    sendSuccess(res, category, 'Category');
  }),
);

router.post(
  '/',
  authenticate,
  authorize(ACCOUNT_TYPES.ADMIN),
  validate(categoryBodySchema),
  asyncHandler(async (req, res) => {
    const slug = req.body.slug || slugify(req.body.nameEn);
    const exists = await JobCategory.findOne({ slug });
    if (exists) throw Errors.conflict('A category with this slug already exists');

    if (req.body.parentId) {
      if (!mongoose.isValidObjectId(req.body.parentId)) {
        throw Errors.badRequest('Invalid parent category');
      }
      const parent = await JobCategory.findById(req.body.parentId);
      if (!parent) throw Errors.notFound('Parent category not found');
      if (parent.parentId) throw Errors.badRequest('Subcategories cannot have children');
    }

    const payload = {
      ...req.body,
      slug,
      parentId: req.body.parentId || null,
      iconUrl: req.body.iconUrl || undefined,
      descriptionEn: req.body.descriptionEn || undefined,
      descriptionHi: req.body.descriptionHi || undefined,
    };

    const category = await JobCategory.create(payload);
    await invalidateCategoryCache();
    sendCreated(res, category, 'Category created');
  }),
);

router.patch(
  '/:id',
  authenticate,
  authorize(ACCOUNT_TYPES.ADMIN),
  validate(categoryBodySchema.partial()),
  asyncHandler(async (req, res) => {
    if (!mongoose.isValidObjectId(req.params.id)) throw Errors.badRequest('Invalid category id');

    const existing = await JobCategory.findById(req.params.id);
    if (!existing) throw Errors.notFound('Category not found');

    if (req.body.parentId) {
      if (!mongoose.isValidObjectId(req.body.parentId)) {
        throw Errors.badRequest('Invalid parent category');
      }
      if (String(req.body.parentId) === String(existing._id)) {
        throw Errors.badRequest('Category cannot be its own parent');
      }
      const parent = await JobCategory.findById(req.body.parentId);
      if (!parent) throw Errors.notFound('Parent category not found');
      if (parent.parentId) throw Errors.badRequest('Subcategories cannot have children');
    }

    if (req.body.nameEn && !req.body.slug) {
      // keep existing slug unless explicitly changed
    }

    const $set: Record<string, unknown> = { ...req.body };
    if (req.body.parentId === null || req.body.parentId === '') $set.parentId = null;
    if (req.body.iconUrl === '') $set.iconUrl = undefined;
    if (req.body.slug) $set.slug = slugify(req.body.slug);

    const category = await JobCategory.findByIdAndUpdate(
      req.params.id,
      { $set },
      { new: true },
    );
    await invalidateCategoryCache();
    sendSuccess(res, category, 'Category updated');
  }),
);

router.delete(
  '/:id',
  authenticate,
  authorize(ACCOUNT_TYPES.ADMIN),
  asyncHandler(async (req, res) => {
    const category = await JobCategory.findByIdAndUpdate(
      req.params.id,
      { $set: { isActive: false } },
      { new: true },
    );
    if (!category) throw Errors.notFound('Category not found');
    await invalidateCategoryCache();
    sendSuccess(res, category, 'Category deactivated');
  }),
);

export default router;
