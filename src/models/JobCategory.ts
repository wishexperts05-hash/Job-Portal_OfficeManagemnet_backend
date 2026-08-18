import mongoose, { Schema, type Document, type Types } from 'mongoose';

export interface IJobCategory extends Document {
  nameEn: string;
  nameHi: string;
  slug: string;
  parentId?: Types.ObjectId | null;
  descriptionEn?: string;
  descriptionHi?: string;
  iconUrl?: string;
  sortOrder: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const jobCategorySchema = new Schema<IJobCategory>(
  {
    nameEn: { type: String, required: true, trim: true },
    nameHi: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true, lowercase: true, index: true },
    parentId: { type: Schema.Types.ObjectId, ref: 'JobCategory', default: null, index: true },
    descriptionEn: String,
    descriptionHi: String,
    iconUrl: String,
    sortOrder: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true, index: true },
  },
  { timestamps: true },
);

jobCategorySchema.index({ parentId: 1, sortOrder: 1 });

export const JobCategory = mongoose.model<IJobCategory>('JobCategory', jobCategorySchema);
