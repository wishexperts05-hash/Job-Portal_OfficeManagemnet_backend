import mongoose, { Schema, type Document, type Types } from 'mongoose';

export interface IEmployerProfile extends Document {
  userId: Types.ObjectId;
  companyName: string;
  companyNameHi?: string;
  ownerName: string;
  gstNumber?: string;
  panNumber?: string;
  companyType?: string;
  employeeCount?: string;
  establishedYear?: number;
  contactPersonName?: string;
  contactDesignation?: string;
  contactEmail?: string;
  contactMobile?: string;
  altMobile?: string;
  addressLine1?: string;
  addressLine2?: string;
  landmark?: string;
  address?: string;
  city?: string;
  district?: string;
  state?: string;
  pincode?: string;
  country?: string;
  industryType: string;
  logoUrl?: string;
  website?: string;
  description?: string;
  descriptionHi?: string;
  isOfficeEnabled: boolean;
  registrationCompleted: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const employerProfileSchema = new Schema<IEmployerProfile>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true, index: true },
    companyName: { type: String, required: true, trim: true, index: true },
    companyNameHi: String,
    ownerName: { type: String, required: true, trim: true },
    gstNumber: { type: String, trim: true, sparse: true },
    panNumber: { type: String, trim: true },
    companyType: String,
    employeeCount: String,
    establishedYear: Number,
    contactPersonName: { type: String, trim: true },
    contactDesignation: String,
    contactEmail: { type: String, trim: true, lowercase: true },
    contactMobile: { type: String, trim: true },
    altMobile: { type: String, trim: true },
    addressLine1: String,
    addressLine2: String,
    landmark: String,
    address: String,
    city: { type: String, index: true },
    district: String,
    state: String,
    pincode: String,
    country: { type: String, default: 'India' },
    industryType: { type: String, default: 'hosiery' },
    logoUrl: String,
    website: String,
    description: String,
    descriptionHi: String,
    isOfficeEnabled: { type: Boolean, default: true },
    registrationCompleted: { type: Boolean, default: true },
  },
  { timestamps: true },
);

employerProfileSchema.index({ companyName: 'text', city: 'text' });

export const EmployerProfile = mongoose.model<IEmployerProfile>(
  'EmployerProfile',
  employerProfileSchema,
);
