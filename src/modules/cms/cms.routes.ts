import { z } from 'zod';
import { Router } from 'express';
import { Banner, CmsPage, PlatformSetting } from '../../models/index.ts';
import { ACCOUNT_TYPES } from '../../constants/index.ts';
import { asyncHandler } from '../../utils/asyncHandler.ts';
import { sendSuccess, sendCreated } from '../../utils/ApiResponse.ts';
import { validate } from '../../middlewares/validate.ts';
import { authenticate, authorize } from '../../middlewares/auth.ts';
import { Errors } from '../../utils/ApiError.ts';
import { getRedis, cacheKeys } from '../../config/redis.ts';

const router = Router();

router.get(
  '/pages/:slug',
  asyncHandler(async (req, res) => {
    const page = await CmsPage.findOne({ slug: req.params.slug, isPublished: true }).lean();
    if (!page) throw Errors.notFound('Page not found');
    sendSuccess(res, page, 'Page');
  }),
);

router.get(
  '/banners',
  asyncHandler(async (req, res) => {
    const placement = req.query.placement ? String(req.query.placement) : undefined;
    const filter: Record<string, unknown> = { isActive: true };
    if (placement) filter.placement = placement;
    const banners = await Banner.find(filter).sort({ sortOrder: 1 }).lean();
    sendSuccess(res, banners, 'Banners');
  }),
);

/** Admin: all banners including inactive */
router.get(
  '/banners/manage',
  authenticate,
  authorize(ACCOUNT_TYPES.ADMIN),
  asyncHandler(async (req, res) => {
    const placement = req.query.placement ? String(req.query.placement) : undefined;
    const filter: Record<string, unknown> = {};
    if (placement) filter.placement = placement;
    const banners = await Banner.find(filter).sort({ sortOrder: 1, createdAt: -1 }).lean();
    sendSuccess(res, banners, 'Banners');
  }),
);

router.get(
  '/settings',
  asyncHandler(async (_req, res) => {
    const redis = getRedis();
    const cached = await redis.get(cacheKeys.settings);
    if (cached) {
      sendSuccess(res, JSON.parse(cached), 'Settings');
      return;
    }
    const settings = await PlatformSetting.find().lean();
    const map = Object.fromEntries(settings.map((s) => [s.key, s.value]));
    await redis.set(cacheKeys.settings, JSON.stringify(map), 'EX', 300);
    sendSuccess(res, map, 'Settings');
  }),
);

// Admin CMS management
router.post(
  '/pages',
  authenticate,
  authorize(ACCOUNT_TYPES.ADMIN),
  validate(
    z.object({
      slug: z.string().min(2),
      titleEn: z.string(),
      titleHi: z.string(),
      bodyEn: z.string(),
      bodyHi: z.string(),
      isPublished: z.boolean().optional(),
    }),
  ),
  asyncHandler(async (req, res) => {
    const page = await CmsPage.findOneAndUpdate(
      { slug: req.body.slug },
      { $set: req.body },
      { upsert: true, new: true },
    );
    sendCreated(res, page, 'Page saved');
  }),
);

const bannerBodySchema = z.object({
  titleEn: z.string().min(1),
  titleHi: z.string().min(1),
  imageUrl: z.string().url(),
  linkUrl: z.string().url().optional().or(z.literal('')).nullable(),
  placement: z.string().optional(),
  sortOrder: z.number().optional(),
  isActive: z.boolean().optional(),
});

router.post(
  '/banners',
  authenticate,
  authorize(ACCOUNT_TYPES.ADMIN),
  validate(bannerBodySchema),
  asyncHandler(async (req, res) => {
    const payload = {
      ...req.body,
      linkUrl: req.body.linkUrl || undefined,
    };
    const banner = await Banner.create(payload);
    sendCreated(res, banner, 'Banner created');
  }),
);

/** Upsert the primary website hero banner (placement = home_hero) */
router.put(
  '/banners/hero',
  authenticate,
  authorize(ACCOUNT_TYPES.ADMIN),
  validate(bannerBodySchema),
  asyncHandler(async (req, res) => {
    const payload = {
      titleEn: req.body.titleEn,
      titleHi: req.body.titleHi,
      imageUrl: req.body.imageUrl,
      linkUrl: req.body.linkUrl || undefined,
      placement: 'home_hero',
      sortOrder: req.body.sortOrder ?? 0,
      isActive: req.body.isActive ?? true,
    };

    const existing = await Banner.findOne({ placement: 'home_hero' }).sort({ sortOrder: 1 });
    if (existing) {
      Object.assign(existing, payload);
      await existing.save();
      sendSuccess(res, existing, 'Hero banner updated');
      return;
    }

    const banner = await Banner.create(payload);
    sendCreated(res, banner, 'Hero banner created');
  }),
);

router.patch(
  '/banners/:id',
  authenticate,
  authorize(ACCOUNT_TYPES.ADMIN),
  validate(bannerBodySchema.partial()),
  asyncHandler(async (req, res) => {
    const $set = { ...req.body };
    if ($set.linkUrl === '') $set.linkUrl = undefined;
    const banner = await Banner.findByIdAndUpdate(req.params.id, { $set }, { new: true });
    if (!banner) throw Errors.notFound('Banner not found');
    sendSuccess(res, banner, 'Banner updated');
  }),
);

router.delete(
  '/banners/:id',
  authenticate,
  authorize(ACCOUNT_TYPES.ADMIN),
  asyncHandler(async (req, res) => {
    const banner = await Banner.findByIdAndDelete(req.params.id);
    if (!banner) throw Errors.notFound('Banner not found');
    sendSuccess(res, { deleted: true }, 'Banner deleted');
  }),
);

router.put(
  '/settings/:key',
  authenticate,
  authorize(ACCOUNT_TYPES.ADMIN),
  validate(
    z.object({
      value: z.unknown(),
      group: z.string().optional(),
    }),
  ),
  asyncHandler(async (req, res) => {
    const setting = await PlatformSetting.findOneAndUpdate(
      { key: req.params.key },
      { $set: { value: req.body.value, group: req.body.group ?? 'general' } },
      { upsert: true, new: true },
    );
    await getRedis().del(cacheKeys.settings);
    sendSuccess(res, setting, 'Setting saved');
  }),
);

export default router;
