import mongoose, { Schema, type Document, type Types } from 'mongoose';

export interface IJobApplication extends Document {
  jobId: Types.ObjectId;
  seekerId: Types.ObjectId;
  seekerProfileId: Types.ObjectId;
  employerId: Types.ObjectId;
  coverNote?: string;
  resumeUrl?: string;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}

const jobApplicationSchema = new Schema<IJobApplication>(
  {
    jobId: { type: Schema.Types.ObjectId, ref: 'Job', required: true, index: true },
    seekerId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    seekerProfileId: { type: Schema.Types.ObjectId, ref: 'JobSeekerProfile', required: true },
    employerId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    coverNote: String,
    resumeUrl: String,
    status: {
      type: String,
      enum: ['applied', 'viewed', 'shortlisted', 'rejected', 'hired', 'withdrawn'],
      default: 'applied',
      index: true,
    },
  },
  { timestamps: true },
);

jobApplicationSchema.index({ jobId: 1, seekerId: 1 }, { unique: true });
jobApplicationSchema.index({ seekerId: 1, createdAt: -1 });

export const JobApplication = mongoose.model<IJobApplication>(
  'JobApplication',
  jobApplicationSchema,
);
