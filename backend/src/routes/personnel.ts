import { Router } from 'express';
import { z } from 'zod';
import { query, queryOne } from '../db/pool';
import { requireAuth, requireCommand, requireField } from '../middleware/auth';
import { asyncHandler } from '../middleware/error';
import { emitToCommand } from '../realtime/io';
import { broadcastStats } from '../services/stats';

const router = Router();
router.use(requireAuth);

const PERSONNEL_SELECT = `
  SELECT u.id, u.full_name, u.username, u.phone, u.photo_url, u.badge_number,
         u.status, u.battery, u.signal, u.last_lat, u.last_lng, u.last_seen_at,
         un.id AS unit_id, un.name AS unit_name, un.code AS unit_code, un.color AS unit_color,
         s.id AS stream_id, s.room_name AS stream_room,
         m.id AS mission_id, m.title AS mission_title, m.priority AS mission_priority,
         m.status AS mission_status
    FROM users u
    JOIN roles r ON r.id = u.role_id
    LEFT JOIN units un ON un.id = u.unit_id
    LEFT JOIN LATERAL (
      SELECT id, room_name FROM streams
       WHERE user_id = u.id AND status = 'live'
       ORDER BY started_at DESC LIMIT 1
    ) s ON TRUE
    LEFT JOIN LATERAL (
      SELECT m.id, m.title, m.priority, m.status
        FROM mission_assignments ma
        JOIN missions m ON m.id = ma.mission_id
       WHERE ma.user_id = u.id AND m.status IN ('pending','running')
       ORDER BY CASE m.priority WHEN 'critical' THEN 0 WHEN 'high' THEN 1
                                WHEN 'medium' THEN 2 ELSE 3 END, m.created_at DESC
       LIMIT 1
    ) m ON TRUE
   WHERE r.code = 'personnel' AND u.is_active
`;

interface PersonnelRow {
  id: number;
  full_name: string;
  username: string;
  phone: string | null;
  photo_url: string | null;
  badge_number: string | null;
  status: string;
  battery: number | null;
  signal: number | null;
  last_lat: number | null;
  last_lng: number | null;
  last_seen_at: string | null;
  unit_id: number | null;
  unit_name: string | null;
  unit_code: string | null;
  unit_color: string | null;
  stream_id: number | null;
  stream_room: string | null;
  mission_id: number | null;
  mission_title: string | null;
  mission_priority: string | null;
  mission_status: string | null;
}

function mapPersonnel(row: PersonnelRow) {
  return {
    id: row.id,
    fullName: row.full_name,
    username: row.username,
    phone: row.phone,
    photoUrl: row.photo_url,
    badgeNumber: row.badge_number,
    status: row.status,
    battery: row.battery,
    signal: row.signal,
    lat: row.last_lat,
    lng: row.last_lng,
    lastSeenAt: row.last_seen_at,
    unit: row.unit_id
      ? { id: row.unit_id, name: row.unit_name, code: row.unit_code, color: row.unit_color }
      : null,
    stream: row.stream_id ? { id: row.stream_id, roomName: row.stream_room } : null,
    mission: row.mission_id
      ? {
          id: row.mission_id,
          title: row.mission_title,
          priority: row.mission_priority,
          status: row.mission_status,
        }
      : null,
  };
}

const listSchema = z.object({
  status: z.enum(['online', 'idle', 'offline']).optional(),
  unitId: z.coerce.number().int().positive().optional(),
  streaming: z.enum(['true', 'false']).optional(),
  q: z.string().max(100).optional(),
});

router.get(
  '/',
  requireCommand,
  asyncHandler(async (req, res) => {
    const filters = listSchema.parse(req.query);
    const clauses: string[] = [];
    const params: unknown[] = [];

    if (filters.status) {
      params.push(filters.status);
      clauses.push(`u.status = $${params.length}`);
    }
    if (filters.unitId) {
      params.push(filters.unitId);
      clauses.push(`u.unit_id = $${params.length}`);
    }
    if (filters.streaming === 'true') clauses.push('s.id IS NOT NULL');
    if (filters.streaming === 'false') clauses.push('s.id IS NULL');
    if (filters.q) {
      params.push(`%${filters.q}%`);
      clauses.push(`(u.full_name ILIKE $${params.length} OR u.badge_number ILIKE $${params.length})`);
    }

    const sql = `${PERSONNEL_SELECT} ${clauses.length ? `AND ${clauses.join(' AND ')}` : ''}
      ORDER BY CASE u.status WHEN 'online' THEN 0 WHEN 'idle' THEN 1 ELSE 2 END, u.full_name`;

    const rows = await query<PersonnelRow>(sql, params);
    res.json({ personnel: rows.map(mapPersonnel), total: rows.length });
  })
);

router.get(
  '/:id',
  requireCommand,
  asyncHandler(async (req, res) => {
    const id = z.coerce.number().int().positive().parse(req.params.id);

    const row = await queryOne<PersonnelRow>(`${PERSONNEL_SELECT} AND u.id = $1`, [id]);
    if (!row) return res.status(404).json({ error: 'Personel tidak ditemukan' });

    const reports = await query(
      // Tanpa kolom `status`: laporan adalah catatan, bukan kiriman yang
      // menunggu persetujuan, jadi kolom itu sudah hilang dari skema.
      `SELECT id, type, title, description, lat, lng, created_at
         FROM reports WHERE user_id = $1 ORDER BY created_at DESC LIMIT 5`,
      [id]
    );

    const track = await query(
      `SELECT lat, lng, recorded_at FROM personnel_locations
        WHERE user_id = $1 ORDER BY recorded_at DESC LIMIT 20`,
      [id]
    );

    res.json({
      personnel: mapPersonnel(row),
      recentReports: reports.map((r) => ({
        id: r.id,
        type: r.type,
        title: r.title,
        description: r.description,
        lat: r.lat,
        lng: r.lng,
        createdAt: r.created_at,
      })),
      track: track.map((t) => ({ lat: t.lat, lng: t.lng, recordedAt: t.recorded_at })).reverse(),
    });
  })
);

const locationSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  accuracy: z.number().nonnegative().optional(),
  speed: z.number().nonnegative().optional(),
  heading: z.number().optional(),
  battery: z.number().int().min(0).max(100).optional(),
  signal: z.number().int().min(0).max(100).optional(),
});

/** Called by the personnel web app every 10 seconds. */
router.post(
  '/location',
  requireField,
  asyncHandler(async (req, res) => {
    const body = locationSchema.parse(req.body);
    const user = req.user!;

    await queryOne(
      `INSERT INTO personnel_locations (user_id, lat, lng, accuracy, speed, heading, battery, signal)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
      [
        user.id, body.lat, body.lng,
        body.accuracy ?? null, body.speed ?? null, body.heading ?? null,
        body.battery ?? null, body.signal ?? null,
      ]
    );

    const updated = await queryOne<{ status: string; battery: number | null; signal: number | null }>(
      `UPDATE users
          SET last_lat = $2, last_lng = $3, last_seen_at = NOW(), status = 'online',
              battery = COALESCE($4, battery), signal = COALESCE($5, signal), updated_at = NOW()
        WHERE id = $1
        RETURNING status, battery, signal`,
      [user.id, body.lat, body.lng, body.battery ?? null, body.signal ?? null]
    );

    emitToCommand('location_updated', {
      userId: user.id,
      fullName: user.fullName,
      lat: body.lat,
      lng: body.lng,
      battery: updated?.battery ?? null,
      signal: updated?.signal ?? null,
      status: updated?.status ?? 'online',
      unitId: user.unitId,
      recordedAt: new Date().toISOString(),
    });

    res.json({ ok: true, status: updated?.status ?? 'online' });
  })
);

const statusSchema = z.object({ status: z.enum(['online', 'idle', 'offline']) });

router.post(
  '/status',
  requireField,
  asyncHandler(async (req, res) => {
    const { status } = statusSchema.parse(req.body);
    const user = req.user!;

    await queryOne(
      `UPDATE users SET status = $2, last_seen_at = NOW(), updated_at = NOW()
        WHERE id = $1 RETURNING id`,
      [user.id, status]
    );

    emitToCommand(status === 'offline' ? 'user_offline' : 'user_online', {
      userId: user.id,
      status,
      fullName: user.fullName,
    });
    await broadcastStats();

    res.json({ ok: true, status });
  })
);

export default router;
