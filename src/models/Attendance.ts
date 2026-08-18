import mongoose, { Schema, type Document, type Types } from 'mongoose';
import { ATTENDANCE_STATUS } from '../constants/index.ts';

export interface IAttendance extends Document {
  employerId: Types.ObjectId;
  employerProfileId: Types.ObjectId;
  employeeId: Types.ObjectId;
  userId: Types.ObjectId;
  siteId: Types.ObjectId;
  date: string; // YYYY-MM-DD
  loginAt?: Date;
  logoutAt?: Date;
  loginLocation?: { type: 'Point'; coordinates: [number, number] };
  logoutLocation?: { type: 'Point'; coordinates: [number, number] };
  status: string;
  workedMinutes?: number;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

const pointSchema = {
  type: { type: String, enum: ['Point'], default: 'Point' },
  coordinates: { type: [Number] },
};

const attendanceSchema = new Schema<IAttendance>(
  {
    employerId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    employerProfileId: { type: Schema.Types.ObjectId, ref: 'EmployerProfile', required: true },
    employeeId: { type: Schema.Types.ObjectId, ref: 'OfficeEmployee', required: true, index: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    siteId: { type: Schema.Types.ObjectId, ref: 'CompanySite', required: true },
    date: { type: String, required: true, index: true },
    loginAt: Date,
    logoutAt: Date,
    loginLocation: pointSchema,
    logoutLocation: pointSchema,
    status: {
      type: String,
      enum: Object.values(ATTENDANCE_STATUS),
      default: ATTENDANCE_STATUS.PRESENT,
    },
    workedMinutes: Number,
    notes: String,
  },
  { timestamps: true },
);

attendanceSchema.index({ employeeId: 1, date: 1 }, { unique: true });
attendanceSchema.index({ employerId: 1, date: 1 });
attendanceSchema.index({ employerId: 1, employeeId: 1, date: -1 });

export const Attendance = mongoose.model<IAttendance>('Attendance', attendanceSchema);
