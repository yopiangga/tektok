import { env } from './env';

/** RFC1918 ranges plus loopback — the addresses a dev machine actually serves on. */
const PRIVATE_HOST =
  /^(localhost|127\.\d+\.\d+\.\d+|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+)$/;

/**
 * Origin check shared by Express CORS and the Socket.IO handshake, so a browser
 * that can load the page can also open the realtime channel.
 */
export function isAllowedOrigin(origin: string | undefined): boolean {
  // Same-origin and non-browser callers (curl, health checks) send no Origin.
  if (!origin) return true;
  if (env.corsOrigin.includes(origin)) return true;
  if (!env.allowPrivateLanOrigins) return false;

  try {
    const { hostname, protocol } = new URL(origin);
    return (protocol === 'http:' || protocol === 'https:') && PRIVATE_HOST.test(hostname);
  } catch {
    return false;
  }
}

/** Callback form expected by both the `cors` middleware and Socket.IO. */
export const corsOriginCheck = (
  origin: string | undefined,
  callback: (err: Error | null, allow?: boolean) => void
) => {
  if (isAllowedOrigin(origin)) callback(null, true);
  else callback(new Error(`Origin ${origin} tidak diizinkan`));
};
