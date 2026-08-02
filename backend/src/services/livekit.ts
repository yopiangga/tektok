import { env } from '../config/env';

export interface StreamCredentials {
  url: string;
  token: string;
  roomName: string;
  /** false when LiveKit is unreachable — the UI then runs in local-preview mode. */
  live: boolean;
  /** Why streaming is unavailable, surfaced to the operator instead of a silent failure. */
  reason?: string;
}

interface TokenOptions {
  roomName: string;
  identity: string;
  name: string;
  canPublish: boolean;
  canSubscribe: boolean;
  /**
   * Host the browser used (e.g. `192.168.1.10:8080`). The client-facing LiveKit
   * URL is derived from it unless LIVEKIT_URL is pinned, because a phone on the
   * LAN cannot reach the server's own `localhost`.
   */
  requestHost?: string;
  requestSecure?: boolean;
}

// Reachability is cached briefly: every stream tile asks for a token, and one
// TCP probe per tile would be wasteful, but a stale "up" result must not
// outlive a server that just died.
const PROBE_TTL_MS = 10_000;
let probe: { at: number; ok: boolean; detail?: string } | null = null;

async function isReachable(): Promise<{ ok: boolean; detail?: string }> {
  if (probe && Date.now() - probe.at < PROBE_TTL_MS) {
    return { ok: probe.ok, detail: probe.detail };
  }

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 2_000);
    // LiveKit answers /rtc/validate on its HTTP port; any HTTP reply proves the
    // signalling server is listening (401/404 included — we only need liveness).
    const response = await fetch(`${env.livekit.internalUrl}`, {
      signal: controller.signal,
    }).finally(() => clearTimeout(timer));

    probe = { at: Date.now(), ok: response.status > 0 };
    return { ok: probe.ok };
  } catch (err) {
    const detail = (err as Error).name === 'AbortError' ? 'timeout' : (err as Error).message;
    probe = { at: Date.now(), ok: false, detail };
    return { ok: false, detail };
  }
}

/** Builds the URL the browser should dial. */
function clientUrl(opts: TokenOptions): string {
  if (env.livekit.url) return env.livekit.url;

  const host = (opts.requestHost ?? 'localhost').split(':')[0];
  const scheme = opts.requestSecure ? 'wss' : 'ws';
  return `${scheme}://${host}:${env.livekit.port}`;
}

/**
 * Issues a LiveKit access token. When LiveKit is unreachable the endpoint still
 * responds so personnel keep a camera preview and the dashboard can render
 * stream tiles — but `live` is false and `reason` says why, so the UI reports
 * the real state rather than showing a black frame labelled LIVE.
 */
export async function createStreamToken(opts: TokenOptions): Promise<StreamCredentials> {
  const url = clientUrl(opts);

  if (!env.livekit.enabled) {
    return { url, token: '', roomName: opts.roomName, live: false, reason: 'disabled' };
  }

  const reach = await isReachable();
  if (!reach.ok) {
    return { url, token: '', roomName: opts.roomName, live: false, reason: 'unreachable' };
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { AccessToken } = require('livekit-server-sdk') as typeof import('livekit-server-sdk');

    const at = new AccessToken(env.livekit.apiKey, env.livekit.apiSecret, {
      identity: opts.identity,
      name: opts.name,
      ttl: '4h',
    });

    at.addGrant({
      room: opts.roomName,
      roomJoin: true,
      canPublish: opts.canPublish,
      canSubscribe: opts.canSubscribe,
      canPublishData: true,
    });

    return { url, token: await at.toJwt(), roomName: opts.roomName, live: true };
  } catch (err) {
    console.warn('[livekit] token generation failed:', (err as Error).message);
    return { url, token: '', roomName: opts.roomName, live: false, reason: 'token-error' };
  }
}

/** Logged at boot so a misconfigured deployment is obvious immediately. */
export async function reportLivekitStatus(): Promise<void> {
  if (!env.livekit.enabled) {
    console.log('[livekit] disabled (LIVEKIT_ENABLED=false) — streaming runs in preview mode');
    return;
  }

  const reach = await isReachable();
  if (reach.ok) {
    console.log(`[livekit] reachable at ${env.livekit.internalUrl} — streaming enabled`);
  } else {
    console.warn(
      `[livekit] NOT reachable at ${env.livekit.internalUrl} (${reach.detail ?? 'no response'})`
    );
    console.warn('[livekit] streaming will run in preview mode. Start it with: npm run infra:up');
  }
}
