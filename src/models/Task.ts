import mongoose, { Schema, type Document, type Types } from 'mongoose';
import { TASK_STATUS } from '../constants/index.js';

export interface ITask extends Document {
  employerId: Types.ObjectId;
  employerProfileId: Types.ObjectId;
  title: string;
  titleHi?: string;
  description?: string;
  descriptionHi?: string;
  assignedToEmployeeIds: Types.ObjectId[];
  assignedBy: Types.ObjectId;
  siteId?: Types.ObjectId;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  status: string;
  dueDate?: Date;
  completedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const taskSchema = new Schema<ITask>(
  {
    employerId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    employerProfileId: { type: Schema.Types.ObjectId, ref: 'EmployerProfile', required: true },
    title: { type: String, required: true, trim: true },
    titleHi: String,
    description: String,
    descriptionHi: String,
    assignedToEmployeeIds: [{ type: Schema.Types.ObjectId, ref: 'OfficeEmployee', index: true }],
    assignedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    siteId: { type: Schema.Types.ObjectId, ref: 'CompanySite' },
    priority: {
      type: String,
      enum: ['low', 'medium', 'high', 'urgent'],
      default: 'medium',
    },
    status: {
      type: String,
      enum: Object.values(TASK_STATUS),
      default: TASK_STATUS.TODO,
      index: true,
    },
    dueDate: Date,
    completedAt: Date,
  },
  { timestamps: true },
);

taskSchema.index({ employerId: 1, status: 1, dueDate: 1 });
taskSchema.index({ assignedToEmployeeIds: 1, status: 1 });

export const Task = mongoose.model<ITask>('Task', taskSchema);
