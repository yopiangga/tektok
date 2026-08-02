import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { query, queryOne } from '../db/pool';
import { requireAuth, requireCommand } from '../middleware/auth';
import { isFieldRole } from '../types';
import { asyncHandler } from '../middleware/error';
import { emitToCommand } from '../realtime/io';
import { logActivity, logSystem } from '../services/activity';
import { notify } from '../services/notify';
import { broadcastStats } from '../services/stats';
import { storeFile } from '../services/storage';

const router = Router();
router.use(requireAuth);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024, files: 5 },
  fileFilter: (_req, file, cb) => {
    if (/^(image|video)\//.test(file.mimetype)) cb(null, true);
    else cb(new Error('Hanya file foto atau video yang diperbolehkan'));
  },
});

const REPORT_SELECT = `
  SELECT r.id, r.type, r.title, r.description, r.lat, r.lng,
         r.created_at, r.updated_at,
         u.id AS user_id, u.full_name AS user_name, u.badge_number,
         un.name AS unit_name,
         COALESCE(
           (SELECT json_agg(json_build_object('id', rm.id, 'kind', rm.kind, 'url', rm.url))
              FROM report_media rm WHERE rm.report_id = r.id),
           '[]'::json
         ) AS media
    FROM reports r
    JOIN users u ON u.id = r.user_id
    LEFT JOIN units un ON un.id = u.unit_id
`;

interface ReportRow {
  id: number;
  type: string;
  title: string | null;
  description: string;
  lat: number | null;
  lng: number | null;
  created_at: string;
  updated_at: string | null;
  user_id: number;
  user_name: string;
  badge_number: string | null;
  unit_name: string | null;
  media: Array<{ id: number; kind: string; url: string }>;
}

const mapReport = (r: ReportRow) => ({
  id: r.id,
  type: r.type,
  title: r.title,
  description: r.description,
  lat: r.lat,
  lng: r.lng,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
  reporter: {
    id: r.user_id,
    fullName: r.user_name,
    badgeNumber: r.badge_number,
    unitName: r.unit_name,
  },
  media: r.media ?? [],
});

const listSchema = z.object({
  type: z.enum(['information', 'incident', 'request_help']).optional(),
  mine: z.enum(['true', 'false']).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const filters = listSchema.parse(req.query);
    const clauses: string[] = [];
    const params: unknown[] = [];

    // Personnel may only ever read their own reports.
    if (isFieldRole(req.user!.role) || filters.mine === 'true') {
      params.push(req.user!.id);
      clauses.push(`r.user_id = $${params.length}`);
    }
    if (filters.type) {
      params.push(filters.type);
      clauses.push(`r.type = $${params.length}`);
    }

    params.push(filters.limit);
    const rows = await query<ReportRow>(
      `${REPORT_SELECT} ${clauses.length ? `WHERE ${clauses.join(' AND ')}` : ''}
       ORDER BY r.created_at DESC LIMIT $${params.length}`,
      params
    );

    res.json({ reports: rows.map(mapReport) });
  })
);

router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = z.coerce.number().int().positive().parse(req.params.id);
    const row = await queryOne<ReportRow>(`${REPORT_SELECT} WHERE r.id = $1`, [id]);
    if (!row) return res.status(404).json({ error: 'Laporan tidak ditemukan' });
    if (isFieldRole(req.user!.role) && row.user_id !== req.user!.id) {
      return res.status(403).json({ error: 'Tidak diizinkan membuka laporan ini' });
    }
    res.json({ report: mapReport(row) });
  })
);

const createSchema = z.object({
  type: z.enum(['information', 'incident', 'request_help']).default('information'),
  title: z.string().max(200).optional(),
  description: z.string().min(1, 'Deskripsi wajib diisi').max(4000),
  lat: z.coerce.number().min(-90).max(90).optional(),
  lng: z.coerce.number().min(-180).max(180).optional(),
});

/** Single-request submit: fields + up to 5 attachments. */
router.post(
  '/',
  upload.array('media', 5),
  asyncHandler(async (req, res) => {
    const body = createSchema.parse(req.body);
    const user = req.user!;

    const operation = await queryOne<{ id: number }>(
      `SELECT id FROM operations WHERE status = 'active' ORDER BY started_at DESC LIMIT 1`
    );

    const report = await queryOne<{ id: number; created_at: string }>(
      `INSERT INTO reports (operation_id, user_id, type, title, description, lat, lng)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id, created_at`,
      [
        operation?.id ?? null,
        user.id,
        body.type,
        body.title ?? null,
        body.description,
        body.lat ?? null,
        body.lng ?? null,
      ]
    );

    const files = (req.files as Express.Multer.File[] | undefined) ?? [];
    for (const file of files) {
      const stored = await storeFile(file);
      await queryOne(
        `INSERT INTO report_media (report_id, kind, url, object_key, mime_type, size_bytes)
         VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
        [
          report!.id,
          file.mimetype.startsWith('video/') ? 'video' : 'photo',
          stored.url,
          stored.objectKey,
          stored.mimeType,
          stored.size,
        ]
      );
    }

    const full = await queryOne<ReportRow>(`${REPORT_SELECT} WHERE r.id = $1`, [report!.id]);
    const mapped = mapReport(full!);

    emitToCommand('report_created', mapped);
    await logActivity({
      userId: user.id,
      type: 'report_created',
      message: `${user.fullName} mengirim laporan ${body.type === 'request_help' ? 'permintaan bantuan' : body.type === 'incident' ? 'insiden' : 'informasi'}`,
      refType: 'report',
      refId: report!.id,
    });
    await notify({
      type: 'new_report',
      title: body.type === 'request_help' ? 'Permintaan Bantuan' : 'Laporan Baru',
      body: `${user.fullName}: ${body.description.slice(0, 120)}`,
      severity: body.type === 'request_help' ? 'danger' : 'info',
      refType: 'report',
      refId: report!.id,
    });
    await broadcastStats();

    res.status(201).json({ report: mapped });
  })
);

/** Separate upload endpoint for attaching media to an existing report. */
router.post(
  '/upload',
  upload.array('media', 5),
  asyncHandler(async (req, res) => {
    const reportId = z.coerce.number().int().positive().parse(req.body.reportId);

    const report = await queryOne<{ user_id: number }>(
      'SELECT user_id FROM reports WHERE id = $1',
      [reportId]
    );
    if (!report) return res.status(404).json({ error: 'Laporan tidak ditemukan' });
    if (isFieldRole(req.user!.role) && report.user_id !== req.user!.id) {
      return res.status(403).json({ error: 'Tidak diizinkan mengubah laporan ini' });
    }

    const files = (req.files as Express.Multer.File[] | undefined) ?? [];
    const media = [];
    for (const file of files) {
      const stored = await storeFile(file);
      const row = await queryOne(
        `INSERT INTO report_media (report_id, kind, url, object_key, mime_type, size_bytes)
         VALUES ($1,$2,$3,$4,$5,$6) RETURNING id, kind, url`,
        [
          reportId,
          file.mimetype.startsWith('video/') ? 'video' : 'photo',
          stored.url,
          stored.objectKey,
          stored.mimeType,
          stored.size,
        ]
      );
      media.push(row);
    }

    res.status(201).json({ media });
  })
);

const updateSchema = z.object({
  type: z.enum(['information', 'incident', 'request_help']).optional(),
  title: z.string().max(200).nullable().optional(),
  description: z.string().min(1, 'Deskripsi wajib diisi').max(4000).optional(),
});

type ModifyGuard = { ok: true; ownerId: number } | { ok: false; status: 404 | 403; error: string };

/** Only the author or a superuser may touch a report. */
async function assertCanModify(
  reportId: number,
  req: import('express').Request
): Promise<ModifyGuard> {
  const row = await queryOne<{ user_id: number }>('SELECT user_id FROM reports WHERE id = $1', [
    reportId,
  ]);
  if (!row) return { ok: false, status: 404, error: 'Laporan tidak ditemukan' };
  if (req.user!.role !== 'superuser' && row.user_id !== req.user!.id) {
    return {
      ok: false,
      status: 403,
      error: 'Hanya pembuat laporan atau super user yang dapat mengubahnya',
    };
  }
  return { ok: true, ownerId: row.user_id };
}

router.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = z.coerce.number().int().positive().parse(req.params.id);
    const body = updateSchema.parse(req.body);

    const guard = await assertCanModify(id, req);
    if (!guard.ok) return res.status(guard.status).json({ error: guard.error });

    const sets: string[] = [];
    const params: unknown[] = [id];
    const push = (column: string, value: unknown) => {
      params.push(value);
      sets.push(`${column} = $${params.length}`);
    };

    if (body.type !== undefined) push('type', body.type);
    if (body.title !== undefined) push('title', body.title);
    if (body.description !== undefined) push('description', body.description);
    if (!sets.length) return res.status(400).json({ error: 'Tidak ada perubahan' });

    await queryOne(
      `UPDATE reports SET ${sets.join(', ')}, updated_at = NOW() WHERE id = $1 RETURNING id`,
      params
    );

    const full = await queryOne<ReportRow>(`${REPORT_SELECT} WHERE r.id = $1`, [id]);
    const mapped = mapReport(full!);

    emitToCommand('report_updated', mapped);
    await logSystem({
      userId: req.user!.id,
      action: 'report.update',
      entity: 'report',
      entityId: id,
      ip: req.ip,
    });

    res.json({ report: mapped });
  })
);

router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = z.coerce.number().int().positive().parse(req.params.id);

    const guard = await assertCanModify(id, req);
    if (!guard.ok) return res.status(guard.status).json({ error: guard.error });

    // report_media cascades from reports, so attachments go with it.
    await queryOne('DELETE FROM reports WHERE id = $1 RETURNING id', [id]);

    emitToCommand('report_deleted', { id });
    await logSystem({
      userId: req.user!.id,
      action: 'report.delete',
      entity: 'report',
      entityId: id,
      ip: req.ip,
      meta: { ownerId: guard.ownerId },
    });
    await broadcastStats();

    res.json({ ok: true, deleted: id });
  })
);

/** CSV export for commanders. */
router.get(
  '/export/csv',
  requireCommand,
  asyncHandler(async (_req, res) => {
    const rows = await query<ReportRow>(`${REPORT_SELECT} ORDER BY r.created_at DESC LIMIT 5000`);

    const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const header = ['id', 'created_at', 'type', 'reporter', 'unit', 'lat', 'lng', 'description'];
    const lines = [
      header.join(','),
      ...rows.map((r) =>
        [r.id, r.created_at, r.type, r.user_name, r.unit_name, r.lat, r.lng, r.description]
          .map(esc)
          .join(',')
      ),
    ];

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="tocs-reports.csv"');
    res.send(lines.join('\n'));
  })
);

export default router;
