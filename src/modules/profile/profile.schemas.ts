import { z } from 'zod';

const optionalString = z.string().trim().optional().or(z.literal(''));

export const educationEntrySchema = z.object({
  level: optionalString,
  degree: z.string().trim().min(2, 'Degree is required'),
  institute: optionalString,
  boardUniversity: optionalString,
  yearOfPassing: z.number().int().min(1950).max(2100).optional(),
  marksPercentage: z.number().min(0).max(100).optional(),
});

export const experienceEntrySchema = z
  .object({
    companyName: z.string().trim().min(2, 'Company name is required'),
    designation: z.string().trim().min(2, 'Designation is required'),
    employmentType: optionalString,
    city: optionalString,
    fromDate: z.coerce.date(),
    toDate: z.coerce.date().optional(),
    currentlyWorking: z.boolean().optional(),
    monthlySalary: z.number().min(0).optional(),
    description: optionalString,
  })
  .refine((v) => v.currentlyWorking || !!v.toDate, {
    message: 'End date is required unless currently working',
    path: ['toDate'],
  })
  .refine((v) => !v.toDate || v.toDate >= v.fromDate, {
    message: 'End date must be after start date',
    path: ['toDate'],
  });

export const employerProfileFieldsSchema = z.object({
  companyName: z.string().trim().min(2, 'Company name is required'),
  companyNameHi: optionalString,
  ownerName: z.string().trim().min(2, 'Owner name is required'),
  gstNumber: optionalString,
  panNumber: optionalString,
  companyType: optionalString,
  employeeCount: optionalString,
  establishedYear: z.number().int().min(1800).max(2100).optional(),
  contactPersonName: optionalString,
  contactDesignation: optionalString,
  contactEmail: z.string().trim().email('Invalid email').optional().or(z.literal('')),
  contactMobile: z
    .string()
    .trim()
    .regex(/^[6-9]\d{9}$/, 'Invalid mobile number')
    .optional()
    .or(z.literal('')),
  altMobile: z
    .string()
    .trim()
    .regex(/^[6-9]\d{9}$/, 'Invalid mobile number')
    .optional()
    .or(z.literal('')),
  addressLine1: optionalString,
  addressLine2: optionalString,
  landmark: optionalString,
  address: optionalString,
  city: optionalString,
  district: optionalString,
  state: optionalString,
  pincode: z
    .string()
    .trim()
    .regex(/^\d{6}$/, 'Pincode must be 6 digits')
    .optional()
    .or(z.literal('')),
  country: optionalString,
  industryType: optionalString,
  logoUrl: optionalString,
  website: optionalString,
  description: optionalString,
  descriptionHi: optionalString,
});

export const jobSeekerProfileFieldsSchema = z.object({
  fullName: z.string().trim().min(2, 'Full name is required'),
  fullNameHi: optionalString,
  fatherName: optionalString,
  gender: z.enum(['male', 'female', 'other']).optional().or(z.literal('')),
  dateOfBirth: z.coerce.date().optional(),
  maritalStatus: optionalString,
  email: z.string().trim().email('Invalid email').optional().or(z.literal('')),
  altMobile: z
    .string()
    .trim()
    .regex(/^[6-9]\d{9}$/, 'Invalid mobile number')
    .optional()
    .or(z.literal('')),
  photoUrl: optionalString,
  headline: optionalString,
  summary: optionalString,
  addressLine1: optionalString,
  addressLine2: optionalString,
  landmark: optionalString,
  city: optionalString,
  district: optionalString,
  state: optionalString,
  pincode: z
    .string()
    .trim()
    .regex(/^\d{6}$/, 'Pincode must be 6 digits')
    .optional()
    .or(z.literal('')),
  skills: z.array(z.string().trim().min(1)).optional(),
  languages: z.array(z.string().trim().min(1)).optional(),
  experienceYears: z.number().min(0).max(60).optional(),
  experienceMonths: z.number().min(0).max(11).optional(),
  education: z.array(educationEntrySchema).optional(),
  experience: z.array(experienceEntrySchema).optional(),
  highestQualification: optionalString,
  currentSalary: z.number().min(0).optional(),
  expectedSalary: z.number().min(0).optional(),
  noticePeriodDays: z.number().min(0).max(365).optional(),
  preferredCities: z.array(z.string().trim().min(1)).optional(),
  preferredEmploymentType: optionalString,
  willingToRelocate: z.boolean().optional(),
  resumeUrl: optionalString,
  resumeName: optionalString,
});

/** Drops empty strings and undefined so PATCH never blanks stored values by accident. */
export function pruneEmpty<T extends Record<string, unknown>>(input: T): Partial<T> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    if (value === undefined || value === '') continue;
    out[key] = value;
  }
  return out as Partial<T>;
}
