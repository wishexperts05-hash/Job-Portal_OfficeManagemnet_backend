import mongoose, { Schema, type Document, type Types } from 'mongoose';
import { ACCOUNT_TYPES, USER_STATUS, type AccountType } from '../constants/index.js';

export interface IUser extends Document {
  _id: Types.ObjectId;
  accountType: AccountType;
  mobile?: string;
  email?: string;
  passwordHash?: string;
  mpinHash?: string;
  isMpinSet: boolean;
  preferredLocale: 'en' | 'hi';
  status: string;
  lastLoginAt?: Date;
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

const userSchema = new Schema<IUser>(
  {
    accountType: {
      type: String,
      enum: Object.values(ACCOUNT_TYPES),
      required: true,
      index: true,
    },
    mobile: { type: String, trim: true, index: true },
    email: { type: String, trim: true, lowercase: true, sparse: true },
    passwordHash: { type: String, select: false },
    mpinHash: { type: String, select: false },
    isMpinSet: { type: Boolean, default: false },
    preferredLocale: { type: String, enum: ['en', 'hi'], default: 'en' },
    status: {
      type: String,
      enum: Object.values(USER_STATUS),
      default: USER_STATUS.ACTIVE,
      index: true,
    },
    lastLoginAt: Date,
    metadata: { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: true },
);

// Unique per account type — same mobile may be employer and job seeker separately
userSchema.index(
  { mobile: 1, accountType: 1 },
  {
    unique: true,
    partialFilterExpression: { mobile: { $type: 'string' } },
  },
);

userSchema.index(
  { email: 1, accountType: 1 },
  {
    unique: true,
    partialFilterExpression: { email: { $type: 'string' } },
  },
);

export const User = mongoose.model<IUser>('User', userSchema);
