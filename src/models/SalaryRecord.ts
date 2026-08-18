import mongoose, { Schema, type Document, type Types } from 'mongoose';

export interface ISalaryRecord extends Document {
  employerId: Types.ObjectId;
  employerProfileId: Types.ObjectId;
  employeeId: Types.ObjectId;
  userId: Types.ObjectId;
  year: number;
  month: number; // 1-12
  presentDays: number;
  halfDays: number;
  absentDays: number;
  leaveDays: number;
  workingDaysInMonth: number;
  baseSalary: number;
  calculatedAmount: number;
  deductions: number;
  bonuses: number;
  netAmount: number;
  status: 'draft' | 'finalized' | 'paid';
  paidAt?: Date;
  notes?: string;
  createdBy: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const salaryRecordSchema = new Schema<ISalaryRecord>(
  {
    employerId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    employerProfileId: { type: Schema.Types.ObjectId, ref: 'EmployerProfile', required: true },
    employeeId: { type: Schema.Types.ObjectId, ref: 'OfficeEmployee', required: true, index: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    year: { type: Number, required: true },
    month: { type: Number, required: true, min: 1, max: 12 },
    presentDays: { type: Number, default: 0 },
    halfDays: { type: Number, default: 0 },
    absentDays: { type: Number, default: 0 },
    leaveDays: { type: Number, default: 0 },
    workingDaysInMonth: { type: Number, required: true },
    baseSalary: { type: Number, required: true },
    calculatedAmount: { type: Number, required: true },
    deductions: { type: Number, default: 0 },
    bonuses: { type: Number, default: 0 },
    netAmount: { type: Number, required: true },
    status: {
      type: String,
      enum: ['draft', 'finalized', 'paid'],
      default: 'draft',
      index: true,
    },
    paidAt: Date,
    notes: String,
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true },
);

salaryRecordSchema.index({ employeeId: 1, year: 1, month: 1 }, { unique: true });
salaryRecordSchema.index({ employerId: 1, year: 1, month: 1 });

export const SalaryRecord = mongoose.model<ISalaryRecord>('SalaryRecord', salaryRecordSchema);
