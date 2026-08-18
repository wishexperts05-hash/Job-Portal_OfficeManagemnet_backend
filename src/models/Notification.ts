import mongoose, { Schema, type Document, type Types } from 'mongoose';

export interface INotification extends Document {
  userId: Types.ObjectId;
  titleEn: string;
  titleHi: string;
  bodyEn: string;
  bodyHi: string;
  type: string;
  data?: Record<string, unknown>;
  channel: Array<'in_app' | 'push' | 'email' | 'sms'>;
  isRead: boolean;
  sentAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const notificationSchema = new Schema<INotification>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    titleEn: { type: String, required: true },
    titleHi: { type: String, required: true },
    bodyEn: { type: String, required: true },
    bodyHi: { type: String, required: true },
    type: { type: String, required: true, index: true },
    data: { type: Schema.Types.Mixed },
    channel: {
      type: [String],
      enum: ['in_app', 'push', 'email', 'sms'],
      default: ['in_app'],
    },
    isRead: { type: Boolean, default: false, index: true },
    sentAt: Date,
  },
  { timestamps: true },
);

notificationSchema.index({ userId: 1, isRead: 1, createdAt: -1 });

export const Notification = mongoose.model<INotification>('Notification', notificationSchema);
