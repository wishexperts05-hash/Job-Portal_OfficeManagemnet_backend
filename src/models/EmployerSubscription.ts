import mongoose, { Schema, type Document, type Types } from 'mongoose';
import { SUBSCRIPTION_STATUS } from '../constants/index.js';

export interface IEmployerSubscription extends Document {
  employerId: Types.ObjectId;
  employerProfileId: Types.ObjectId;
  planId: Types.ObjectId;
  status: string;
  billingCycle: 'monthly' | 'yearly' | 'lifetime';
  startsAt: Date;
  endsAt?: Date;
  jobsPostedCount: number;
  paymentProvider?: string;
  paymentRef?: string;
  amountPaid: number;
  autoRenew: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const employerSubscriptionSchema = new Schema<IEmployerSubscription>(
  {
    employerId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    employerProfileId: { type: Schema.Types.ObjectId, ref: 'EmployerProfile', required: true },
    planId: { type: Schema.Types.ObjectId, ref: 'SubscriptionPlan', required: true },
    status: {
      type: String,
      enum: Object.values(SUBSCRIPTION_STATUS),
      default: SUBSCRIPTION_STATUS.TRIAL,
      index: true,
    },
    billingCycle: {
      type: String,
      enum: ['monthly', 'yearly', 'lifetime'],
      default: 'monthly',
    },
    startsAt: { type: Date, required: true },
    endsAt: Date,
    jobsPostedCount: { type: Number, default: 0 },
    paymentProvider: String,
    paymentRef: String,
    amountPaid: { type: Number, default: 0 },
    autoRenew: { type: Boolean, default: false },
  },
  { timestamps: true },
);

employerSubscriptionSchema.index({ employerId: 1, status: 1 });

export const EmployerSubscription = mongoose.model<IEmployerSubscription>(
  'EmployerSubscription',
  employerSubscriptionSchema,
);
