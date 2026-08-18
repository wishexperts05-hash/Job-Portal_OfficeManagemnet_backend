import mongoose, { Schema, type Document, type Types } from 'mongoose';

export interface IEducationEntry {
  level?: string;
  degree: string;
  institute?: string;
  boardUniversity?: string;
  yearOfPassing?: number;
  marksPercentage?: number;
}

export interface IExperienceEntry {
  companyName: string;
  designation: string;
  employmentType?: string;
  city?: string;
  fromDate: Date;
  toDate?: Date;
  currentlyWorking?: boolean;
  monthlySalary?: number;
  description?: string;
}

export interface IJobSeekerProfile extends Document {
  userId: Types.ObjectId;
  fullName: string;
  fullNameHi?: string;
  fatherName?: string;
  gender?: string;
  dateOfBirth?: Date;
  maritalStatus?: string;
  email?: string;
  altMobile?: string;
  photoUrl?: string;
  headline?: string;
  summary?: string;
  addressLine1?: string;
  addressLine2?: string;
  landmark?: string;
  city?: string;
  district?: string;
  state?: string;
  pincode?: string;
  skills: string[];
  languages: string[];
  experienceYears?: number;
  experienceMonths?: number;
  education: IEducationEntry[];
  experience: IExperienceEntry[];
  highestQualification?: string;
  currentSalary?: number;
  expectedSalary?: number;
  noticePeriodDays?: number;
  preferredCities: string[];
  preferredEmploymentType?: string;
  willingToRelocate?: boolean;
  resumeUrl?: string;
  resumeName?: string;
  preferredJobCategories: Types.ObjectId[];
  registrationCompleted: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const educationSchema = new Schema<IEducationEntry>(
  {
    level: String,
    degree: { type: String, required: true, trim: true },
    institute: String,
    boardUniversity: String,
    yearOfPassing: Number,
    marksPercentage: Number,
  },
  { _id: true },
);

const experienceSchema = new Schema<IExperienceEntry>(
  {
    companyName: { type: String, required: true, trim: true },
    designation: { type: String, required: true, trim: true },
    employmentType: String,
    city: String,
    fromDate: { type: Date, required: true },
    toDate: Date,
    currentlyWorking: { type: Boolean, default: false },
    monthlySalary: Number,
    description: String,
  },
  { _id: true },
);

const jobSeekerProfileSchema = new Schema<IJobSeekerProfile>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true, index: true },
    fullName: { type: String, required: true, trim: true, index: true },
    fullNameHi: String,
    fatherName: String,
    gender: String,
    dateOfBirth: Date,
    maritalStatus: String,
    email: { type: String, trim: true, lowercase: true },
    altMobile: String,
    photoUrl: String,
    headline: String,
    summary: String,
    addressLine1: String,
    addressLine2: String,
    landmark: String,
    city: { type: String, index: true },
    district: String,
    state: String,
    pincode: String,
    skills: { type: [String], default: [] },
    languages: { type: [String], default: [] },
    experienceYears: { type: Number, default: 0 },
    experienceMonths: { type: Number, default: 0 },
    education: { type: [educationSchema], default: [] },
    experience: { type: [experienceSchema], default: [] },
    highestQualification: String,
    currentSalary: Number,
    expectedSalary: Number,
    noticePeriodDays: Number,
    preferredCities: { type: [String], default: [] },
    preferredEmploymentType: String,
    willingToRelocate: { type: Boolean, default: false },
    resumeUrl: String,
    resumeName: String,
    preferredJobCategories: [{ type: Schema.Types.ObjectId, ref: 'JobCategory' }],
    registrationCompleted: { type: Boolean, default: true },
  },
  { timestamps: true },
);

jobSeekerProfileSchema.index({ fullName: 'text', skills: 'text', city: 'text' });

export const JobSeekerProfile = mongoose.model<IJobSeekerProfile>(
  'JobSeekerProfile',
  jobSeekerProfileSchema,
);
