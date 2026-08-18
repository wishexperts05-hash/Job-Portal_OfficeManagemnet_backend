import admin from 'firebase-admin';
import { env } from '../config/env.ts';
import { PUSH_CONFIG } from '../constants/config.ts';

let initialized = false;

export function initFirebase(): void {
  if (initialized || PUSH_CONFIG.PROVIDER !== 'firebase') return;

  if (!env.FIREBASE_PROJECT_ID || !env.FIREBASE_CLIENT_EMAIL || !env.FIREBASE_PRIVATE_KEY) {
    console.warn('[firebase] credentials missing — push notifications disabled');
    return;
  }

  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: env.FIREBASE_PROJECT_ID,
        clientEmail: env.FIREBASE_CLIENT_EMAIL,
        privateKey: env.FIREBASE_PRIVATE_KEY,
      }),
    });
  }

  initialized = true;
  console.log('[firebase] initialized');
}

export async function sendPushNotification(input: {
  tokens: string[];
  title: string;
  body: string;
  data?: Record<string, string>;
}): Promise<{ successCount: number; failureCount: number }> {
  if (PUSH_CONFIG.PROVIDER === 'mock') {
    console.log(`[push:mock] tokens=${input.tokens.length} title=${input.title}`);
    return { successCount: input.tokens.length, failureCount: 0 };
  }

  initFirebase();

  if (!initialized || !input.tokens.length) {
    return { successCount: 0, failureCount: input.tokens.length };
  }

  const response = await admin.messaging().sendEachForMulticast({
    tokens: input.tokens,
    notification: {
      title: input.title,
      body: input.body,
    },
    data: input.data,
  });

  return {
    successCount: response.successCount,
    failureCount: response.failureCount,
  };
}
