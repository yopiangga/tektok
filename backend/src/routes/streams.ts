import { Router } from 'express';
import { z } from 'zod';
import { query, queryOne } from '../db/pool';
import { randomUUID } from 'crypto';
import type { Request } from 'express';
import { requireAuth, requireCommand, requireField } from '../middleware/auth';
import { asyncHandler } from '../middleware/error';
import { emitToCommand } from '../realtime/io';
import { logActivity } from '../services/activity';
import { createStreamToken } from '../services/livekit';
import { notify } from '../services/notify';
import { broadcastStats } from '../services/stats';

const router = Router();
router.use(requireAuth);

/**
 * The address the browser reached us on. Behind the reverse proxy this comes
 * from X-Forwarded-*; it is what lets a field phone dial LiveKit on the LAN
 * address instead of a `localhost` that only resolves on the server.
 */
function originOf(req: Request) {
  const forwardedHost = req.headers['x-forwarded-host'];
  const host =
    (Array.isArray(forwardedHost) ? forwardedHost[0] : forwardedHost) ??
    req.headers.host ??
    'localhost';
  const forwardedProto = req.headers['x-forwarded-proto'];
  const proto = (Array.isArray(forwardedProto) ? forwardedProto[0] : forwardedProto) ?? req.protocol;

  return { requestHost: host, requestSecure: proto === 'https' };
}

interface StreamRow {
  id: number;
  room_name: string;
  status: string;
  quality: string;
  started_at: string;
  ended_at: string | null;
  user_id: number;
  full_name: string;
  badge_number: string | null;
  unit_name: string | null;
  unit_color: string | null;
}

const STREAM_SELECT = `
  SELECT s.id, s.room_name, s.status, s.quality, s.started_at, s.ended_at,
         u.id AS user_id, u.full_name, u.badge_number,
         un.name AS unit_name, un.color AS unit_color
    FROM streams s
    JOIN users u ON u.id = s.user_id
    LEFT JOIN units un ON un.id = u.unit_id
`;

const mapStream = (s: StreamRow) => ({
  id: s.id,
  roomName: s.room_name,
  status: s.status,
  quality: s.quality,
  startedAt: s.started_at,
  endedAt: s.ended_at,
  officer: {
    id: s.user_id,
    fullName: s.full_name,
    badgeNumber: s.badge_number,
    unitName: s.unit_name,
    unitColor: s.unit_color,
  },
});

router.get(
  '/',
  requireCommand,
  asyncHandler(async (req, res) => {
    const status = z.enum(['live', 'ended']).default('live').parse(req.query.status ?? 'live');
    const rows = await query<StreamRow>(
      `${STREAM_SELECT} WHERE s.status = $1 ORDER BY s.started_at DESC LIMIT 64`,
      [status]
    );
    res.json({ streams: rows.map(mapStream) });
  })
);

/** Personnel starts broadcasting. Returns publisher credentials. */
router.post(
  '/start',
  requireField,
  asyncHandler(async (req, res) => {
    const user = req.user!;

    // A device only ever holds one live room. If a previous session was never
    // closed (tab killed, network drop), reuse the row but restart the clock:
    // the dashboard orders tiles by started_at, so leaving a stale timestamp
    // buries a genuinely-live stream below older ones and it never appears.
    const existing = await queryOne<{ id: number; room_name: string }>(
      `SELECT id, room_name FROM streams WHERE user_id = $1 AND status = 'live'
        ORDER BY started_at DESC LIMIT 1`,
      [user.id]
    );

    // A fresh room name per session prevents a new publisher from inheriting
    // viewers that were still attached to the abandoned room.
    const roomName = `tocs-${user.id}-${Date.now()}`;

    const stream = existing
      ? (await queryOne<{ id: number }>(
          `UPDATE streams SET room_name = $2, started_at = NOW(), ended_at = NULL,
                              status = 'live', quality = 'good'
            WHERE id = $1 RETURNING id`,
          [existing.id, roomName]
        ))!
      : (await queryOne<{ id: number }>(
          `INSERT INTO streams (user_id, room_name, status) VALUES ($1,$2,'live') RETURNING id`,
          [user.id, roomName]
        ))!;

    const credentials = await createStreamToken({
      roomName,
      identity: `personnel-${user.id}`,
      name: user.fullName,
      canPublish: true,
      canSubscribe: false,
      ...originOf(req),
    });

    // Always announce: pressing START is a deliberate act and the command centre
    // must resubscribe to the new room even when the row was recycled.
    const full = await queryOne<StreamRow>(`${STREAM_SELECT} WHERE s.id = $1`, [stream.id]);
    emitToCommand('stream_started', mapStream(full!));
    await logActivity({
      userId: user.id,
      type: 'stream_started',
      message: `${user.fullName} memulai siaran langsung`,
      refType: 'stream',
      refId: stream.id,
    });
    await notify({
      type: 'stream_started',
      title: 'Siaran Dimulai',
      body: `${user.fullName} memulai siaran langsung.`,
      severity: 'info',
      refType: 'stream',
      refId: stream.id,
    });
    await broadcastStats();

    res.status(201).json({ streamId: stream.id, ...credentials });
  })
);

router.post(
  '/stop',
  requireField,
  asyncHandler(async (req, res) => {
    const user = req.user!;

    const stopped = await queryOne<{ id: number }>(
      `UPDATE streams SET status = 'ended', ended_at = NOW()
        WHERE user_id = $1 AND status = 'live' RETURNING id`,
      [user.id]
    );
    if (!stopped) return res.json({ ok: true, stopped: false });

    emitToCommand('stream_stopped', { streamId: stopped.id, userId: user.id });
    await logActivity({
      userId: user.id,
      type: 'stream_stopped',
      message: `${user.fullName} menghentikan siaran langsung`,
      refType: 'stream',
      refId: stopped.id,
    });
    await broadcastStats();

    res.json({ ok: true, stopped: true, streamId: stopped.id });
  })
);

/** Command centre requests a subscribe-only token for a live stream. */
router.get(
  '/:id/viewer-token',
  requireCommand,
  asyncHandler(async (req, res) => {
    const id = z.coerce.number().int().positive().parse(req.params.id);
    const user = req.user!;

    const stream = await queryOne<{ room_name: string; status: string }>(
      'SELECT room_name, status FROM streams WHERE id = $1',
      [id]
    );
    if (!stream) return res.status(404).json({ error: 'Siaran tidak ditemukan' });
    if (stream.status !== 'live') return res.status(409).json({ error: 'Siaran sudah berakhir' });

    const credentials = await createStreamToken({
      roomName: stream.room_name,
      // LiveKit treats identity as unique within a room: joining twice with the
      // same one evicts the earlier session. A stable `viewer-<user>-<stream>`
      // therefore breaks the ordinary cases — two dashboards, two browser tabs,
      // or a component that remounts and resubscribes — where the newer
      // connection silently kicks the one actually rendering. Make it per-token.
      identity: `viewer-${user.id}-${id}-${randomUUID().slice(0, 8)}`,
      name: user.fullName,
      canPublish: false,
      canSubscribe: true,
      ...originOf(req),
    });

    res.json(credentials);
  })
);

const qualitySchema = z.object({ quality: z.enum(['good', 'fair', 'poor']) });

router.post(
  '/quality',
  requireField,
  asyncHandler(async (req, res) => {
    const { quality } = qualitySchema.parse(req.body);
    const updated = await queryOne<{ id: number }>(
      `UPDATE streams SET quality = $2 WHERE user_id = $1 AND status = 'live' RETURNING id`,
      [req.user!.id, quality]
    );
    if (updated) {
      emitToCommand('stream_started', { id: updated.id, quality, partial: true });
    }
    res.json({ ok: true });
  })
);

export default router;
