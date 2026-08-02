import http from 'http';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import { corsOriginCheck } from './config/cors';
import { env, isProd } from './config/env';
import { pool } from './db/pool';
import { errorHandler, notFound } from './middleware/error';
import { initSocket } from './realtime/io';
import { reportLivekitStatus } from './services/livekit';
import { startPresenceSweep } from './services/presence';
import { ensureLocalUploadDir } from './services/storage';
import './types';

import authRoutes from './routes/auth';
import dashboardRoutes from './routes/dashboard';
import incidentRoutes from './routes/incidents';
import messageRoutes from './routes/messages';
import missionRoutes from './routes/missions';
import notificationRoutes from './routes/notifications';
import personnelRoutes from './routes/personnel';
import reportRoutes from './routes/reports';
import settingsRoutes from './routes/settings';
import streamRoutes from './routes/streams';

const app = express();
app.set('trust proxy', 1);

app.use(
  helmet({
    // Media is served cross-origin to the Vite dev server and to MinIO.
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    contentSecurityPolicy: false,
  })
);
app.use(cors({ origin: corsOriginCheck, credentials: true }));
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

app.use(
  rateLimit({
    windowMs: 60_000,
    limit: 600, // 100 personnel × GPS every 10s + dashboard traffic
    standardHeaders: true,
    legacyHeaders: false,
  })
);

ensureLocalUploadDir();
app.use('/uploads', express.static(env.uploadDir, { maxAge: '7d' }));

app.get('/health', async (_req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok', uptime: process.uptime() });
  } catch {
    res.status(503).json({ status: 'degraded', database: 'unreachable' });
  }
});

app.use('/api/auth', authRoutes);
app.use('/api/personnel', personnelRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/missions', missionRoutes);
app.use('/api/incidents', incidentRoutes);
app.use('/api/streams', streamRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/settings', settingsRoutes);

app.use(notFound);
app.use(errorHandler);

const server = http.createServer(app);
initSocket(server);

server.listen(env.port, () => {
  console.log(`[tocs] API listening on :${env.port} (${env.nodeEnv})`);
  console.log(`[tocs] CORS origins: ${env.corsOrigin.join(', ')}`);
  if (env.allowPrivateLanOrigins) console.log('[tocs] CORS: origin LAN privat juga diizinkan (non-produksi)');
  console.log(`[tocs] storage: ${env.minio.enabled ? 'MinIO' : 'local disk'}`);
  void reportLivekitStatus();
  startPresenceSweep();
});

async function shutdown(signal: string) {
  console.log(`[tocs] ${signal} received, shutting down`);
  server.close(async () => {
    await pool.end();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));

if (!isProd) {
  process.on('unhandledRejection', (reason) => console.error('[unhandledRejection]', reason));
}

export { app, server };
