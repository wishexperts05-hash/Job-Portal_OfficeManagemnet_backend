import mongoose, { Schema, type Document } from 'mongoose';

export interface ISubscriptionPlan extends Document {
  code: string;
  nameEn: string;
  nameHi: string;
  descriptionEn?: string;
  descriptionHi?: string;
  priceMonthly: number;
  priceYearly: number;
  jobPostLimit: number; // -1 = unlimited
  featuredJobLimit: number;
  features: string[];
  isFree: boolean;
  isActive: boolean;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
}

const subscriptionPlanSchema = new Schema<ISubscriptionPlan>(
  {
    code: { type: String, required: true, unique: true, uppercase: true },
    nameEn: { type: String, required: true },
    nameHi: { type: String, required: true },
    descriptionEn: String,
    descriptionHi: String,
    priceMonthly: { type: Number, default: 0 },
    priceYearly: { type: Number, default: 0 },
    jobPostLimit: { type: Number, default: -1 },
    featuredJobLimit: { type: Number, default: 0 },
    features: { type: [String], default: [] },
    isFree: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true },
    sortOrder: { type: Number, default: 0 },
  },
  { timestamps: true },
);

export const SubscriptionPlan = mongoose.model<ISubscriptionPlan>(
  'SubscriptionPlan',
  subscriptionPlanSchema,
);
