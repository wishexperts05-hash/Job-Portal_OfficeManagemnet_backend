import mongoose, { Schema, type Document } from 'mongoose';
import { ACCOUNT_TYPES, LEAD_STATUS } from '../constants/index.js';

export interface IRegistrationLead extends Document {
  accountType: 'employer' | 'job_seeker';
  mobile: string;
  formData: Record<string, unknown>;
  progressPercent: number;
  lastStep?: string;
  status: string;
  locale: 'en' | 'hi';
  ipAddress?: string;
  userAgent?: string;
  convertedUserId?: mongoose.Types.ObjectId;
  contactedAt?: Date;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

const registrationLeadSchema = new Schema<IRegistrationLead>(
  {
    accountType: {
      type: String,
      enum: [ACCOUNT_TYPES.EMPLOYER, ACCOUNT_TYPES.JOB_SEEKER],
      required: true,
      index: true,
    },
    mobile: { type: String, required: true, index: true },
    formData: { type: Schema.Types.Mixed, default: {} },
    progressPercent: { type: Number, default: 0, min: 0, max: 100 },
    lastStep: String,
    status: {
      type: String,
      enum: Object.values(LEAD_STATUS),
      default: LEAD_STATUS.IN_PROGRESS,
      index: true,
    },
    locale: { type: String, enum: ['en', 'hi'], default: 'en' },
    ipAddress: String,
    userAgent: String,
    convertedUserId: { type: Schema.Types.ObjectId, ref: 'User' },
    contactedAt: Date,
    notes: String,
  },
  { timestamps: true },
);

registrationLeadSchema.index({ mobile: 1, accountType: 1, status: 1 });
registrationLeadSchema.index({ createdAt: -1 });
registrationLeadSchema.index({ status: 1, updatedAt: -1 });

export const RegistrationLead = mongoose.model<IRegistrationLead>(
  'RegistrationLead',
  registrationLeadSchema,
);
