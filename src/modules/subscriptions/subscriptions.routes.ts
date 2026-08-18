import { z } from 'zod';
import { Router } from 'express';
import dayjs from 'dayjs';
import {
  SubscriptionPlan,
  EmployerSubscription,
  PaymentOrder,
  EmployerProfile,
} from '../../models/index.ts';
import { ACCOUNT_TYPES, SUBSCRIPTION_STATUS } from '../../constants/index.ts';
import { asyncHandler } from '../../utils/asyncHandler.ts';
import { sendSuccess, sendCreated } from '../../utils/ApiResponse.ts';
import { validate } from '../../middlewares/validate.ts';
import { authenticate, authorize } from '../../middlewares/auth.ts';
import { Errors } from '../../utils/ApiError.ts';
import { env } from '../../config/env.ts';
import { PAYMENT_CONFIG } from '../../constants/config.ts';
import { v4 as uuidv4 } from 'uuid';

const router = Router();

router.get(
  '/plans',
  asyncHandler(async (_req, res) => {
    const plans = await SubscriptionPlan.find({ isActive: true }).sort({ sortOrder: 1 }).lean();
    sendSuccess(res, plans, 'Plans');
  }),
);

router.post(
  '/plans',
  authenticate,
  authorize(ACCOUNT_TYPES.ADMIN),
  validate(
    z.object({
      code: z.string().min(2),
      nameEn: z.string(),
      nameHi: z.string(),
      descriptionEn: z.string().optional(),
      descriptionHi: z.string().optional(),
      priceMonthly: z.number().min(0),
      priceYearly: z.number().min(0),
      jobPostLimit: z.number(),
      featuredJobLimit: z.number().optional(),
      features: z.array(z.string()).optional(),
      isFree: z.boolean().optional(),
      sortOrder: z.number().optional(),
    }),
  ),
  asyncHandler(async (req, res) => {
    const plan = await SubscriptionPlan.create({
      ...req.body,
      code: req.body.code.toUpperCase(),
    });
    sendCreated(res, plan, 'Plan created');
  }),
);

router.get(
  '/my',
  authenticate,
  authorize(ACCOUNT_TYPES.EMPLOYER),
  asyncHandler(async (req, res) => {
    const sub = await EmployerSubscription.findOne({
      employerId: req.user!.id,
      status: { $in: [SUBSCRIPTION_STATUS.ACTIVE, SUBSCRIPTION_STATUS.TRIAL] },
    })
      .populate('planId')
      .sort({ createdAt: -1 });
    sendSuccess(res, sub, 'Current subscription');
  }),
);

router.post(
  '/checkout',
  authenticate,
  authorize(ACCOUNT_TYPES.EMPLOYER),
  validate(
    z.object({
      planId: z.string(),
      billingCycle: z.enum(['monthly', 'yearly']).default('monthly'),
    }),
  ),
  asyncHandler(async (req, res) => {
    const plan = await SubscriptionPlan.findById(req.body.planId);
    if (!plan?.isActive) throw Errors.notFound('Plan not found');

    const amount =
      req.body.billingCycle === 'yearly' ? plan.priceYearly : plan.priceMonthly;

    const order = await PaymentOrder.create({
      employerId: req.user!.id,
      planId: plan._id,
      amount,
      currency: 'INR',
      provider: PAYMENT_CONFIG.PROVIDER,
      providerOrderId: `${PAYMENT_CONFIG.PROVIDER}_${uuidv4()}`,
      status: 'created',
      billingCycle: req.body.billingCycle,
    });

    // Razorpay order create can replace this when keys are present
    sendCreated(
      res,
      {
        order,
        payment: {
          provider: PAYMENT_CONFIG.PROVIDER,
          keyId: env.RAZORPAY_KEY_ID || undefined,
          checkoutUrl: null,
          mockPayEndpoint:
            PAYMENT_CONFIG.PROVIDER === 'mock'
              ? `/api/v1/subscriptions/mock-pay/${order.id}`
              : undefined,
        },
      },
      'Checkout created',
    );
  }),
);

router.post(
  '/mock-pay/:orderId',
  authenticate,
  authorize(ACCOUNT_TYPES.EMPLOYER),
  asyncHandler(async (req, res) => {
    if (PAYMENT_CONFIG.PROVIDER !== 'mock') {
      throw Errors.badRequest('Mock pay only available in mock mode');
    }

    const order = await PaymentOrder.findOne({
      _id: req.params.orderId,
      employerId: req.user!.id,
    });
    if (!order) throw Errors.notFound('Order not found');
    if (order.status === 'paid') throw Errors.conflict('Already paid');

    order.status = 'paid';
    order.paidAt = new Date();
    await order.save();

    const profile = await EmployerProfile.findOne({ userId: req.user!.id });
    if (!profile) throw Errors.forbidden();

    const endsAt =
      order.billingCycle === 'yearly'
        ? dayjs().add(1, 'year').toDate()
        : dayjs().add(1, 'month').toDate();

    await EmployerSubscription.updateMany(
      {
        employerId: req.user!.id,
        status: { $in: [SUBSCRIPTION_STATUS.ACTIVE, SUBSCRIPTION_STATUS.TRIAL] },
      },
      { $set: { status: SUBSCRIPTION_STATUS.CANCELLED } },
    );

    const sub = await EmployerSubscription.create({
      employerId: req.user!.id,
      employerProfileId: profile._id,
      planId: order.planId,
      status: SUBSCRIPTION_STATUS.ACTIVE,
      billingCycle: order.billingCycle,
      startsAt: new Date(),
      endsAt,
      paymentProvider: order.provider,
      paymentRef: order.providerOrderId,
      amountPaid: order.amount,
    });

    sendSuccess(res, { order, subscription: sub }, 'Payment successful');
  }),
);

export default router;
