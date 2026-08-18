import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import { env, corsOrigins } from './config/env.ts';
import { globalRateLimiter } from './middlewares/rateLimiter.ts';
import { errorHandler, notFoundHandler } from './middlewares/errorHandler.ts';
import routes from './routes/index.ts';

export function createApp() {
  const app = express();

  app.set('trust proxy', 1);
  app.use(helmet());
  app.use(
    cors({
      origin: corsOrigins,
      credentials: true,
    }),
  );
  app.use(
    compression({
      filter: (req, res) => {
        if (req.url.includes('/notifications/stream')) return false;
        return compression.filter(req, res);
      },
    }),
  );
  app.use(express.json({ limit: '2mb' }));
  app.use(express.urlencoded({ extended: true }));
  app.use(cookieParser());
  app.use(morgan(env.NODE_ENV === 'production' ? 'combined' : 'dev'));
  app.use(globalRateLimiter);

  app.use(env.API_PREFIX, routes);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
