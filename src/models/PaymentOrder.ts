import mongoose, { Schema, type Document, type Types } from 'mongoose';

export interface IPaymentOrder extends Document {
  employerId: Types.ObjectId;
  planId: Types.ObjectId;
  amount: number;
  currency: string;
  provider: string;
  providerOrderId?: string;
  status: 'created' | 'paid' | 'failed' | 'refunded';
  billingCycle: 'monthly' | 'yearly';
  metadata?: Record<string, unknown>;
  paidAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const paymentOrderSchema = new Schema<IPaymentOrder>(
  {
    employerId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    planId: { type: Schema.Types.ObjectId, ref: 'SubscriptionPlan', required: true },
    amount: { type: Number, required: true },
    currency: { type: String, default: 'INR' },
    provider: { type: String, default: 'mock' },
    providerOrderId: { type: String, index: true },
    status: {
      type: String,
      enum: ['created', 'paid', 'failed', 'refunded'],
      default: 'created',
      index: true,
    },
    billingCycle: { type: String, enum: ['monthly', 'yearly'], default: 'monthly' },
    metadata: Schema.Types.Mixed,
    paidAt: Date,
  },
  { timestamps: true },
);

export const PaymentOrder = mongoose.model<IPaymentOrder>('PaymentOrder', paymentOrderSchema);
