import mongoose, { Schema, type Document, type Types } from 'mongoose';

export interface ILocationTrack extends Document {
  employerId: Types.ObjectId;
  employeeId: Types.ObjectId;
  userId: Types.ObjectId;
  date: string; // YYYY-MM-DD
  points: Array<{
    coordinates: [number, number]; // [lng, lat]
    recordedAt: Date;
    accuracy?: number;
    speed?: number;
  }>;
  createdAt: Date;
  updatedAt: Date;
}

const locationTrackSchema = new Schema<ILocationTrack>(
  {
    employerId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    employeeId: { type: Schema.Types.ObjectId, ref: 'OfficeEmployee', required: true, index: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    date: { type: String, required: true, index: true },
    points: [
      {
        coordinates: { type: [Number], required: true },
        recordedAt: { type: Date, required: true },
        accuracy: Number,
        speed: Number,
      },
    ],
  },
  { timestamps: true },
);

locationTrackSchema.index({ employeeId: 1, date: 1 }, { unique: true });
locationTrackSchema.index({ employerId: 1, date: 1 });

export const LocationTrack = mongoose.model<ILocationTrack>('LocationTrack', locationTrackSchema);
