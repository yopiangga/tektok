import { Router } from 'express';
import { z } from 'zod';
import { query, queryOne } from '../db/pool';
import { requireAuth, requireCommand } from '../middleware/auth';
import { asyncHandler } from '../middleware/error';
import { getStats } from '../services/stats';

const router = Router();
router.use(requireAuth, requireCommand);

router.get(
  '/stats',
  asyncHandler(async (_req, res) => {
    res.json({ stats: await getStats() });
  })
);

router.get(
  '/operation',
  asyncHandler(async (_req, res) => {
    const operation = await queryOne(
      `SELECT id, name, code, description, status, center_lat, center_lng, started_at
         FROM operations WHERE status = 'active' ORDER BY started_at DESC LIMIT 1`
    );
    res.json({
      operation: operation
        ? {
            id: operation.id,
            name: operation.name,
            code: operation.code,
            description: operation.description,
            status: operation.status,
            center: { lat: operation.center_lat, lng: operation.center_lng },
            startedAt: operation.started_at,
          }
        : null,
    });
  })
);

router.get(
  '/units',
  asyncHandler(async (_req, res) => {
    const rows = await query(
      `SELECT un.id, un.code, un.name, un.color,
              COUNT(u.id) FILTER (WHERE u.is_active) AS total,
              COUNT(u.id) FILTER (WHERE u.status = 'online') AS online
         FROM units un
         LEFT JOIN users u ON u.unit_id = un.id
        GROUP BY un.id ORDER BY un.code`
    );
    res.json({
      units: rows.map((u) => ({
        id: u.id,
        code: u.code,
        name: u.name,
        color: u.color,
        total: Number(u.total),
        online: Number(u.online),
      })),
    });
  })
);

/** Realtime activity timeline. */
router.get(
  '/activity',
  asyncHandler(async (req, res) => {
    const limit = z.coerce.number().int().min(1).max(200).default(40).parse(req.query.limit ?? 40);
    const rows = await query(
      `SELECT a.id, a.type, a.message, a.ref_type, a.ref_id, a.created_at,
              u.full_name AS user_name
         FROM activity_logs a
         LEFT JOIN users u ON u.id = a.user_id
        ORDER BY a.created_at DESC LIMIT $1`,
      [limit]
    );
    res.json({
      activity: rows.map((a) => ({
        id: a.id,
        type: a.type,
        message: a.message,
        refType: a.ref_type,
        refId: a.ref_id,
        userName: a.user_name,
        createdAt: a.created_at,
      })),
    });
  })
);

/**
 * Every marker the map needs in one round-trip: personnel, incidents,
 * reports and missions. Colours follow the blueprint legend.
 */
router.get(
  '/map',
  asyncHandler(async (_req, res) => {
    const personnel = await query(
      `SELECT u.id, u.full_name, u.status, u.battery, u.last_lat, u.last_lng, u.last_seen_at,
              un.name AS unit_name,
              EXISTS (SELECT 1 FROM streams s WHERE s.user_id = u.id AND s.status = 'live') AS streaming
         FROM users u
         JOIN roles r ON r.id = u.role_id
         LEFT JOIN units un ON un.id = u.unit_id
        WHERE r.code = 'personnel' AND u.is_active
          AND u.last_lat IS NOT NULL AND u.last_lng IS NOT NULL`
    );

    const incidents = await query(
      `SELECT id, title, priority, status, location, lat, lng, created_at
         FROM incidents
        WHERE status <> 'closed' AND lat IS NOT NULL AND lng IS NOT NULL`
    );

    const reports = await query(
      `SELECT r.id, r.type, r.title, r.lat, r.lng, r.created_at, u.full_name AS user_name
         FROM reports r JOIN users u ON u.id = r.user_id
        WHERE r.lat IS NOT NULL AND r.lng IS NOT NULL
          AND r.created_at >= NOW() - INTERVAL '24 hours'
        ORDER BY r.created_at DESC LIMIT 200`
    );

    const missions = await query(
      `SELECT id, title, priority, status, lat, lng
         FROM missions
        WHERE status IN ('pending','running') AND lat IS NOT NULL AND lng IS NOT NULL`
    );

    res.json({
      personnel: personnel.map((p) => ({
        id: p.id,
        fullName: p.full_name,
        status: p.status,
        battery: p.battery,
        lat: p.last_lat,
        lng: p.last_lng,
        unitName: p.unit_name,
        streaming: p.streaming,
        lastSeenAt: p.last_seen_at,
      })),
      incidents: incidents.map((i) => ({
        id: i.id,
        title: i.title,
        priority: i.priority,
        status: i.status,
        location: i.location,
        lat: i.lat,
        lng: i.lng,
        createdAt: i.created_at,
      })),
      reports: reports.map((r) => ({
        id: r.id,
        type: r.type,
        title: r.title,
        lat: r.lat,
        lng: r.lng,
        userName: r.user_name,
        createdAt: r.created_at,
      })),
      missions: missions.map((m) => ({
        id: m.id,
        title: m.title,
        priority: m.priority,
        status: m.status,
        lat: m.lat,
        lng: m.lng,
      })),
    });
  })
);

/** Global search across personnel, missions, incidents, reports and locations. */
router.get(
  '/search',
  asyncHandler(async (req, res) => {
    const q = z.string().min(1).max(100).parse(req.query.q);
    const like = `%${q}%`;

    const [personnel, missions, incidents, reports] = await Promise.all([
      query(
        `SELECT u.id, u.full_name, u.badge_number, u.status, un.name AS unit_name
           FROM users u JOIN roles r ON r.id = u.role_id
           LEFT JOIN units un ON un.id = u.unit_id
          WHERE r.code = 'personnel'
            AND (u.full_name ILIKE $1 OR u.badge_number ILIKE $1 OR un.name ILIKE $1)
          LIMIT 8`,
        [like]
      ),
      query(
        `SELECT id, title, status, priority FROM missions
          WHERE title ILIKE $1 OR description ILIKE $1 LIMIT 8`,
        [like]
      ),
      query(
        `SELECT id, title, status, priority, location FROM incidents
          WHERE title ILIKE $1 OR location ILIKE $1 OR description ILIKE $1 LIMIT 8`,
        [like]
      ),
      query(
        `SELECT r.id, r.title, r.type, u.full_name AS user_name
           FROM reports r JOIN users u ON u.id = r.user_id
          WHERE r.title ILIKE $1 OR r.description ILIKE $1 LIMIT 8`,
        [like]
      ),
    ]);

    res.json({
      results: {
        personnel: personnel.map((p) => ({
          id: p.id,
          label: p.full_name,
          sub: `${p.badge_number ?? '-'} · ${p.unit_name ?? 'Tanpa unit'}`,
          status: p.status,
        })),
        missions: missions.map((m) => ({
          id: m.id,
          label: m.title,
          sub: `${m.status} · ${m.priority}`,
        })),
        incidents: incidents.map((i) => ({
          id: i.id,
          label: i.title,
          sub: `${i.location ?? 'Lokasi tidak tercatat'} · ${i.status}`,
        })),
        reports: reports.map((r) => ({
          id: r.id,
          label: r.title ?? `Laporan #${r.id}`,
          sub: r.user_name,
        })),
      },
    });
  })
);

export default router;
