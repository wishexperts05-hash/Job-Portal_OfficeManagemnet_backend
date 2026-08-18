import mongoose, { Schema, type Document } from 'mongoose';

export interface ICmsPage extends Document {
  slug: string;
  titleEn: string;
  titleHi: string;
  bodyEn: string;
  bodyHi: string;
  isPublished: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const cmsPageSchema = new Schema<ICmsPage>(
  {
    slug: { type: String, required: true, unique: true, lowercase: true },
    titleEn: { type: String, required: true },
    titleHi: { type: String, required: true },
    bodyEn: { type: String, required: true },
    bodyHi: { type: String, required: true },
    isPublished: { type: Boolean, default: true },
  },
  { timestamps: true },
);

export const CmsPage = mongoose.model<ICmsPage>('CmsPage', cmsPageSchema);

export interface IBanner extends Document {
  titleEn: string;
  titleHi: string;
  imageUrl: string;
  linkUrl?: string;
  placement: string;
  sortOrder: number;
  isActive: boolean;
  startsAt?: Date;
  endsAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const bannerSchema = new Schema<IBanner>(
  {
    titleEn: { type: String, required: true },
    titleHi: { type: String, required: true },
    imageUrl: { type: String, required: true },
    linkUrl: String,
    placement: { type: String, default: 'home_hero', index: true },
    sortOrder: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
    startsAt: Date,
    endsAt: Date,
  },
  { timestamps: true },
);

export const Banner = mongoose.model<IBanner>('Banner', bannerSchema);

export interface IPlatformSetting extends Document {
  key: string;
  value: unknown;
  group: string;
  updatedAt: Date;
}

const platformSettingSchema = new Schema<IPlatformSetting>(
  {
    key: { type: String, required: true, unique: true },
    value: { type: Schema.Types.Mixed, required: true },
    group: { type: String, default: 'general', index: true },
  },
  { timestamps: { createdAt: false, updatedAt: true } },
);

export const PlatformSetting = mongoose.model<IPlatformSetting>(
  'PlatformSetting',
  platformSettingSchema,
);
