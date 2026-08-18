import mongoose, { Schema, type Document, type Types } from 'mongoose';

/** HH:mm local shift times for the site (e.g. "09:30", "18:00"). */
const timeHm = {
  type: String,
  trim: true,
  match: /^([01]\d|2[0-3]):[0-5]\d$/,
};

export interface ICompanySite extends Document {
  employerId: Types.ObjectId;
  employerProfileId: Types.ObjectId;
  name: string;
  nameHi?: string;
  address?: string;
  city?: string;
  state?: string;
  pincode?: string;
  location: {
    type: 'Point';
    coordinates: [number, number]; // [lng, lat]
  };
  geofenceRadiusMeters: number;
  /** Expected employee login time (HH:mm) */
  loginTime?: string;
  /** Expected employee logout time (HH:mm) */
  logoutTime?: string;
  isPrimary: boolean;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const companySiteSchema = new Schema<ICompanySite>(
  {
    employerId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    employerProfileId: {
      type: Schema.Types.ObjectId,
      ref: 'EmployerProfile',
      required: true,
      index: true,
    },
    name: { type: String, required: true, trim: true },
    nameHi: String,
    address: String,
    city: String,
    state: String,
    pincode: String,
    location: {
      type: { type: String, enum: ['Point'], default: 'Point' },
      coordinates: { type: [Number], required: true }, // [lng, lat]
    },
    geofenceRadiusMeters: { type: Number, default: 150, min: 20, max: 5000 },
    loginTime: timeHm,
    logoutTime: timeHm,
    isPrimary: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true },
);

companySiteSchema.index({ location: '2dsphere' });
companySiteSchema.index({ employerId: 1, isActive: 1 });

export const CompanySite = mongoose.model<ICompanySite>('CompanySite', companySiteSchema);
