import mongoose, { Schema, type Document, type Types } from 'mongoose';
import { USER_STATUS } from '../constants/index.ts';

export interface IOfficeEmployee extends Document {
  employerId: Types.ObjectId;
  employerProfileId: Types.ObjectId;
  userId: Types.ObjectId;
  mobile: string;
  fullName: string;
  fullNameHi?: string;
  employeeCode?: string;
  email?: string;
  alternateMobile?: string;
  aadhaarNumber?: string;
  dob?: Date;
  gender?: 'male' | 'female' | 'other';
  maritalStatus?: 'single' | 'married' | 'other';
  designation?: string;
  department?: string;
  qualification?: string;
  joiningDate?: Date;
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  state?: string;
  pincode?: string;
  emergencyContactName?: string;
  emergencyContactMobile?: string;
  baseSalary: number;
  salaryCycle: 'monthly' | 'daily' | 'weekly';
  primarySiteId?: Types.ObjectId;
  locationTrackingEnabled: boolean;
  canManageExpenditure: boolean;
  status: string;
  deactivatedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const officeEmployeeSchema = new Schema<IOfficeEmployee>(
  {
    employerId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    employerProfileId: {
      type: Schema.Types.ObjectId,
      ref: 'EmployerProfile',
      required: true,
      index: true,
    },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    mobile: { type: String, required: true, index: true },
    fullName: { type: String, required: true, trim: true },
    fullNameHi: String,
    employeeCode: { type: String, trim: true },
    email: { type: String, trim: true, lowercase: true },
    alternateMobile: { type: String, trim: true },
    aadhaarNumber: { type: String, trim: true },
    dob: Date,
    gender: { type: String, enum: ['male', 'female', 'other'] },
    maritalStatus: { type: String, enum: ['single', 'married', 'other'] },
    designation: String,
    department: String,
    qualification: String,
    joiningDate: Date,
    addressLine1: String,
    addressLine2: String,
    city: String,
    state: String,
    pincode: String,
    emergencyContactName: String,
    emergencyContactMobile: String,
    baseSalary: { type: Number, default: 0 },
    salaryCycle: { type: String, enum: ['monthly', 'daily', 'weekly'], default: 'monthly' },
    primarySiteId: { type: Schema.Types.ObjectId, ref: 'CompanySite' },
    locationTrackingEnabled: { type: Boolean, default: false },
    canManageExpenditure: { type: Boolean, default: false },
    status: {
      type: String,
      enum: [USER_STATUS.ACTIVE, USER_STATUS.INACTIVE, USER_STATUS.SUSPENDED],
      default: USER_STATUS.ACTIVE,
      index: true,
    },
    deactivatedAt: Date,
  },
  { timestamps: true },
);

// Same person can work for multiple employers
officeEmployeeSchema.index({ employerId: 1, mobile: 1 }, { unique: true });
officeEmployeeSchema.index({ employerId: 1, aadhaarNumber: 1 }, { unique: true, sparse: true });
officeEmployeeSchema.index({ userId: 1, status: 1 });
officeEmployeeSchema.index({ employerId: 1, status: 1, fullName: 1 });

export const OfficeEmployee = mongoose.model<IOfficeEmployee>(
  'OfficeEmployee',
  officeEmployeeSchema,
);
