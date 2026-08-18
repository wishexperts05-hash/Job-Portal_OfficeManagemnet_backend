import mongoose from 'mongoose';
import { env } from './env.ts';

export async function connectMongo(): Promise<typeof mongoose> {
  mongoose.set('strictQuery', true);

  mongoose.connection.on('connected', () => {
    console.log('[mongo] connected');
  });

  mongoose.connection.on('error', (err) => {
    console.error('[mongo] error', err);
  });

  mongoose.connection.on('disconnected', () => {
    console.warn('[mongo] disconnected');
  });

  return mongoose.connect(env.MONGODB_URI, {
    maxPoolSize: 50,
    minPoolSize: 5,
    serverSelectionTimeoutMS: 10000,
  });
}
