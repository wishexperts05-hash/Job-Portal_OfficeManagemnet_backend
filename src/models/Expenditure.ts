import mongoose, { Schema, type Document, type Types } from 'mongoose';
import { TXN_TYPE } from '../constants/index.ts';

export interface IExpenditure extends Document {
  employerId: Types.ObjectId;
  employerProfileId: Types.ObjectId;
  type: 'credit' | 'debit';
  amount: number;
  category: string;
  categoryHi?: string;
  description?: string;
  employeeId?: Types.ObjectId;
  siteId?: Types.ObjectId;
  transactionDate: Date;
  paymentMode?: string;
  referenceNo?: string;
  attachmentUrl?: string;
  createdBy: Types.ObjectId;
  createdByRole: 'employer' | 'office_employee' | 'admin';
  createdAt: Date;
  updatedAt: Date;
}

const expenditureSchema = new Schema<IExpenditure>(
  {
    employerId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    employerProfileId: { type: Schema.Types.ObjectId, ref: 'EmployerProfile', required: true },
    type: { type: String, enum: Object.values(TXN_TYPE), required: true, index: true },
    amount: { type: Number, required: true, min: 0 },
    category: { type: String, required: true, index: true },
    categoryHi: String,
    description: String,
    employeeId: { type: Schema.Types.ObjectId, ref: 'OfficeEmployee', index: true },
    siteId: { type: Schema.Types.ObjectId, ref: 'CompanySite' },
    transactionDate: { type: Date, required: true, index: true },
    paymentMode: {
      type: String,
      enum: ['cash', 'upi', 'bank', 'cheque', 'other'],
      default: 'cash',
    },
    referenceNo: String,
    attachmentUrl: String,
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    createdByRole: {
      type: String,
      enum: ['employer', 'office_employee', 'admin'],
      required: true,
    },
  },
  { timestamps: true },
);

expenditureSchema.index({ employerId: 1, transactionDate: -1 });
expenditureSchema.index({ employerId: 1, type: 1, category: 1, transactionDate: -1 });
expenditureSchema.index({ employeeId: 1, transactionDate: -1 });

export const Expenditure = mongoose.model<IExpenditure>('Expenditure', expenditureSchema);
