import path from 'path';
import dotenv from 'dotenv';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });
dotenv.config({ path: path.resolve(process.cwd(), '../.env') });

function num(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export const env = {
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port: num(process.env.PORT, 4000),

  databaseUrl:
    process.env.DATABASE_URL ?? 'postgres://tocs:tocs@localhost:5432/tocs',

  jwtSecret: process.env.JWT_SECRET ?? 'tocs-development-secret-change-me',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? '12h',

  // Socket.IO validates the Origin header too, so 127.0.0.1 and localhost must
  // both be listed — a dev proxy forwards whichever host the browser used.
  corsOrigin: (
    process.env.CORS_ORIGIN ??
    'http://localhost:5173,http://127.0.0.1:5173,http://localhost:8080,http://127.0.0.1:8080'
  )
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean),

  /**
   * Outside production, also accept any private-LAN origin.
   *
   * A pinned list goes stale the moment the machine changes network or Vite
   * picks another port, and the symptom — a blocked Socket.IO handshake — reads
   * as a broken app rather than a config drift. Never enabled in production,
   * where the allowlist is the point.
   */
  allowPrivateLanOrigins: process.env.NODE_ENV !== 'production',

  // Offline threshold in seconds — personnel with no GPS ping past this are offline.
  idleAfterSeconds: num(process.env.IDLE_AFTER_SECONDS, 60),
  offlineAfterSeconds: num(process.env.OFFLINE_AFTER_SECONDS, 180),
  lowBatteryThreshold: num(process.env.LOW_BATTERY_THRESHOLD, 20),

  uploadDir: process.env.UPLOAD_DIR ?? path.resolve(process.cwd(), 'uploads'),
  publicUrl: process.env.PUBLIC_URL ?? 'http://localhost:4000',

  minio: {
    enabled: process.env.MINIO_ENABLED === 'true',
    endPoint: process.env.MINIO_ENDPOINT ?? 'localhost',
    port: num(process.env.MINIO_PORT, 9000),
    useSSL: process.env.MINIO_USE_SSL === 'true',
    accessKey: process.env.MINIO_ACCESS_KEY ?? 'tocsadmin',
    secretKey: process.env.MINIO_SECRET_KEY ?? 'tocsadmin123',
    bucket: process.env.MINIO_BUCKET ?? 'tocs-media',
  },

  livekit: {
    // Default on: whether streaming actually works is decided by probing the
    // server, not by a flag, so a stale toggle cannot make a healthy install
    // look broken (or a broken one look healthy). Set 'false' to hard-disable.
    enabled: process.env.LIVEKIT_ENABLED !== 'false',
    /**
     * Client-facing URL. Leave empty (or 'auto') to derive it per request from
     * the host the browser used — required for field phones, which cannot reach
     * a hardcoded `localhost`.
     */
    url: process.env.LIVEKIT_URL && process.env.LIVEKIT_URL !== 'auto' ? process.env.LIVEKIT_URL : '',
    port: num(process.env.LIVEKIT_PORT, 7880),
    /** Server-side address used only for the reachability probe. */
    internalUrl: process.env.LIVEKIT_INTERNAL_URL ?? 'http://localhost:7880',
    apiKey: process.env.LIVEKIT_API_KEY ?? 'devkey',
    apiSecret: process.env.LIVEKIT_API_SECRET ?? 'devsecretdevsecretdevsecret0123456789',
  },
};

export const isProd = env.nodeEnv === 'production';
