import { createApp } from './app.js';
import { env } from './config/env.js';
import { connectMongo } from './config/db.js';
import { getRedis, disconnectRedis } from './config/redis.js';
import { configureCloudinary } from './config/cloudinary.js';
import { initFirebase } from './services/push.service.js';

async function bootstrap() {
  configureCloudinary();
  initFirebase();
  await connectMongo();
  getRedis();

  const app = createApp();
  const server = app.listen(env.PORT, () => {
    console.log(`[server] listening on :${env.PORT} (${env.API_PREFIX})`);
  });

  const shutdown = async (signal: string) => {
    console.log(`[server] ${signal} received, shutting down`);
    server.close(async () => {
      await disconnectRedis();
      process.exit(0);
    });
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

bootstrap().catch((err) => {
  console.error('[server] failed to start', err);
  process.exit(1);
});
