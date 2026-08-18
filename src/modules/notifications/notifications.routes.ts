import { z } from 'zod';
import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import { Notification, User } from '../../models/index.ts';
import { asyncHandler } from '../../utils/asyncHandler.ts';
import { sendSuccess, sendCreated } from '../../utils/ApiResponse.ts';
import { validate } from '../../middlewares/validate.ts';
import { authenticate, authorize } from '../../middlewares/auth.ts';
import { ACCOUNT_TYPES } from '../../constants/index.ts';
import { Errors } from '../../utils/ApiError.ts';
import { getPagination, paginationMeta } from '../../utils/pagination.ts';
import { dispatchNotification } from '../../services/notify.service.ts';
import { subscribeUserEvents } from '../../services/realtime.service.ts';
import { verifyAccessToken } from '../../utils/jwt.ts';

const router = Router();

/** Allow SSE clients that cannot set Authorization headers (query token). */
function authenticateStream(req: Request, _res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  const queryToken = typeof req.query.token === 'string' ? req.query.token : '';
  const raw = header?.startsWith('Bearer ') ? header.slice(7) : queryToken;
  if (!raw) {
    next(Errors.unauthorized('Missing access token'));
    return;
  }
  try {
    const payload = verifyAccessToken(raw);
    req.user = { ...payload, id: payload.sub };
    next();
  } catch {
    next(Errors.unauthorized('Invalid or expired access token'));
  }
}

router.get(
  '/',
  authenticate,
  asyncHandler(async (req, res) => {
    const { page, limit, skip, sort } = getPagination(req);
    const filter: Record<string, unknown> = { userId: req.user!.id };
    if (req.query.unread === 'true') filter.isRead = false;

    const [items, total] = await Promise.all([
      Notification.find(filter).sort(sort).skip(skip).limit(limit).lean(),
      Notification.countDocuments(filter),
    ]);
    sendSuccess(res, items, 'Notifications', 200, paginationMeta(total, page, limit));
  }),
);

router.get(
  '/unread-count',
  authenticate,
  asyncHandler(async (req, res) => {
    const count = await Notification.countDocuments({
      userId: req.user!.id,
      isRead: false,
    });
    sendSuccess(res, { count }, 'Unread count');
  }),
);

router.get(
  '/stream',
  authenticateStream,
  asyncHandler(async (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();

    const userId = req.user!.id;
    const send = (event: string, data: unknown) => {
      res.write(`event: ${event}\n`);
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    };

    send('connected', { ok: true, userId });

    const unreadCount = await Notification.countDocuments({
      userId,
      isRead: false,
    });
    send('unread', { unreadCount });

    const unsubscribe = subscribeUserEvents(userId, (payload) => {
      send('notification', payload);
    });

    const heartbeat = setInterval(() => {
      res.write(`event: ping\ndata: ${Date.now()}\n\n`);
    }, 25000);

    req.on('close', () => {
      clearInterval(heartbeat);
      unsubscribe();
    });
  }),
);

router.patch(
  '/:id/read',
  authenticate,
  asyncHandler(async (req, res) => {
    const n = await Notification.findOneAndUpdate(
      { _id: req.params.id, userId: req.user!.id },
      { $set: { isRead: true } },
      { new: true },
    );
    if (!n) throw Errors.notFound('Notification not found');
    sendSuccess(res, n, 'Marked read');
  }),
);

router.post(
  '/read-all',
  authenticate,
  asyncHandler(async (req, res) => {
    const result = await Notification.updateMany(
      { userId: req.user!.id, isRead: false },
      { $set: { isRead: true } },
    );
    sendSuccess(res, { modified: result.modifiedCount }, 'All marked read');
  }),
);

router.post(
  '/device-token',
  authenticate,
  validate(z.object({ token: z.string().min(10) })),
  asyncHandler(async (req, res) => {
    const user = await User.findById(req.user!.id);
    if (!user) throw Errors.notFound('User not found');
    const tokens = new Set<string>(
      Array.isArray(user.metadata?.fcmTokens) ? (user.metadata.fcmTokens as string[]) : [],
    );
    tokens.add(req.body.token);
    user.metadata = { ...user.metadata, fcmTokens: Array.from(tokens) };
    await user.save();
    sendSuccess(res, { count: tokens.size }, 'Device token saved');
  }),
);

router.post(
  '/send',
  authenticate,
  authorize(ACCOUNT_TYPES.ADMIN),
  validate(
    z.object({
      userId: z.string(),
      titleEn: z.string(),
      titleHi: z.string(),
      bodyEn: z.string(),
      bodyHi: z.string(),
      type: z.string(),
      channel: z.array(z.enum(['in_app', 'push', 'email', 'sms'])).optional(),
      data: z.record(z.string(), z.unknown()).optional(),
      emailTo: z.string().email().optional(),
    }),
  ),
  asyncHandler(async (req, res) => {
    const n = await dispatchNotification(req.body);
    sendCreated(res, n, 'Notification sent');
  }),
);

export default router;
