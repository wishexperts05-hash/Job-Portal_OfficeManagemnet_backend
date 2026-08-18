import { createApp } from './app.ts';
import { env } from './config/env.ts';
import { connectMongo } from './config/db.ts';
import { getRedis, disconnectRedis } from './config/redis.ts';
import { configureCloudinary } from './config/cloudinary.ts';
import { initFirebase } from './services/push.service.ts';

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
