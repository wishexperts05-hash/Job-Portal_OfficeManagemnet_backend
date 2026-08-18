import mongoose, { Schema, type Document, type Types } from 'mongoose';
import { JOB_STATUS } from '../constants/index.js';

export interface IJob extends Document {
  employerId: Types.ObjectId;
  employerProfileId: Types.ObjectId;
  titleEn: string;
  titleHi: string;
  descriptionEn: string;
  descriptionHi: string;
  categoryId: Types.ObjectId;
  subcategoryId?: Types.ObjectId;
  employmentType: string;
  experienceMin?: number;
  experienceMax?: number;
  salaryMin?: number;
  salaryMax?: number;
  salaryType?: string;
  vacancies: number;
  city: string;
  state?: string;
  locationText?: string;
  skills: string[];
  status: string;
  rejectionReason?: string;
  approvedBy?: Types.ObjectId;
  approvedAt?: Date;
  publishedAt?: Date;
  expiresAt?: Date;
  viewsCount: number;
  applicationsCount: number;
  isFeatured: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const jobSchema = new Schema<IJob>(
  {
    employerId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    employerProfileId: {
      type: Schema.Types.ObjectId,
      ref: 'EmployerProfile',
      required: true,
      index: true,
    },
    titleEn: { type: String, required: true, trim: true },
    titleHi: { type: String, required: true, trim: true },
    descriptionEn: { type: String, required: true },
    descriptionHi: { type: String, required: true },
    categoryId: { type: Schema.Types.ObjectId, ref: 'JobCategory', required: true, index: true },
    subcategoryId: { type: Schema.Types.ObjectId, ref: 'JobCategory', index: true },
    employmentType: {
      type: String,
      enum: ['full_time', 'part_time', 'contract', 'temporary', 'internship'],
      default: 'full_time',
    },
    experienceMin: Number,
    experienceMax: Number,
    salaryMin: Number,
    salaryMax: Number,
    salaryType: { type: String, enum: ['monthly', 'daily', 'hourly', 'yearly'], default: 'monthly' },
    vacancies: { type: Number, default: 1 },
    city: { type: String, required: true, index: true },
    state: String,
    locationText: String,
    skills: { type: [String], default: [] },
    status: {
      type: String,
      enum: Object.values(JOB_STATUS),
      default: JOB_STATUS.PENDING_APPROVAL,
      index: true,
    },
    rejectionReason: String,
    approvedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    approvedAt: Date,
    publishedAt: Date,
    expiresAt: Date,
    viewsCount: { type: Number, default: 0 },
    applicationsCount: { type: Number, default: 0 },
    isFeatured: { type: Boolean, default: false },
  },
  { timestamps: true },
);

jobSchema.index({ status: 1, publishedAt: -1 });
jobSchema.index({ city: 1, status: 1, categoryId: 1 });
jobSchema.index({ titleEn: 'text', titleHi: 'text', descriptionEn: 'text', skills: 'text' });
jobSchema.index({ employerId: 1, status: 1, createdAt: -1 });

export const Job = mongoose.model<IJob>('Job', jobSchema);
