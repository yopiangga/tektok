import { Router } from 'express';
import { z } from 'zod';
import { query, queryOne } from '../db/pool';
import { requireAuth, requireCommand } from '../middleware/auth';
import { asyncHandler } from '../middleware/error';
import { emitToCommand, emitToUser } from '../realtime/io';
import { logActivity } from '../services/activity';
import { notify } from '../services/notify';
import { broadcastStats } from '../services/stats';

const router = Router();
router.use(requireAuth, requireCommand);

const INCIDENT_SELECT = `
  SELECT i.id, i.title, i.description, i.priority, i.status, i.location,
         i.lat, i.lng, i.created_at, i.closed_at,
         rp.id AS reporter_id, rp.full_name AS reporter_name,
         asg.id AS assignee_id, asg.full_name AS assignee_name
    FROM incidents i
    LEFT JOIN users rp ON rp.id = i.reporter_id
    LEFT JOIN users asg ON asg.id = i.assignee_id
`;

interface IncidentRow {
  id: number;
  title: string;
  description: string | null;
  priority: string;
  status: string;
  location: string | null;
  lat: number | null;
  lng: number | null;
  created_at: string;
  closed_at: string | null;
  reporter_id: number | null;
  reporter_name: string | null;
  assignee_id: number | null;
  assignee_name: string | null;
}

const mapIncident = (i: IncidentRow) => ({
  id: i.id,
  title: i.title,
  description: i.description,
  priority: i.priority,
  status: i.status,
  location: i.location,
  lat: i.lat,
  lng: i.lng,
  createdAt: i.created_at,
  closedAt: i.closed_at,
  reporter: i.reporter_id ? { id: i.reporter_id, fullName: i.reporter_name } : null,
  assignee: i.assignee_id ? { id: i.assignee_id, fullName: i.assignee_name } : null,
});

const listSchema = z.object({
  status: z.enum(['open', 'investigating', 'closed']).optional(),
  priority: z.enum(['low', 'medium', 'high', 'critical']).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const filters = listSchema.parse(req.query);
    const clauses: string[] = [];
    const params: unknown[] = [];

    if (filters.status) {
      params.push(filters.status);
      clauses.push(`i.status = $${params.length}`);
    }
    if (filters.priority) {
      params.push(filters.priority);
      clauses.push(`i.priority = $${params.length}`);
    }

    params.push(filters.limit);
    const rows = await query<IncidentRow>(
      `${INCIDENT_SELECT} ${clauses.length ? `WHERE ${clauses.join(' AND ')}` : ''}
       ORDER BY CASE i.status WHEN 'open' THEN 0 WHEN 'investigating' THEN 1 ELSE 2 END,
                CASE i.priority WHEN 'critical' THEN 0 WHEN 'high' THEN 1
                                WHEN 'medium' THEN 2 ELSE 3 END,
                i.created_at DESC
       LIMIT $${params.length}`,
      params
    );

    res.json({ incidents: rows.map(mapIncident) });
  })
);

router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = z.coerce.number().int().positive().parse(req.params.id);
    const row = await queryOne<IncidentRow>(`${INCIDENT_SELECT} WHERE i.id = $1`, [id]);
    if (!row) return res.status(404).json({ error: 'Insiden tidak ditemukan' });
    res.json({ incident: mapIncident(row) });
  })
);

const createSchema = z.object({
  title: z.string().min(1, 'Judul insiden wajib diisi').max(200),
  description: z.string().max(4000).optional(),
  priority: z.enum(['low', 'medium', 'high', 'critical']).default('medium'),
  location: z.string().max(200).optional(),
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
  reporterId: z.number().int().positive().optional(),
  reportId: z.number().int().positive().optional(),
});

router.post(
  '/',
  asyncHandler(async (req, res) => {
    const body = createSchema.parse(req.body);
    const user = req.user!;

    const operation = await queryOne<{ id: number }>(
      `SELECT id FROM operations WHERE status = 'active' ORDER BY started_at DESC LIMIT 1`
    );

    const incident = await queryOne<{ id: number }>(
      `INSERT INTO incidents (operation_id, title, description, priority, location, lat, lng,
                              reporter_id, report_id, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
      [
        operation?.id ?? null,
        body.title,
        body.description ?? null,
        body.priority,
        body.location ?? null,
        body.lat ?? null,
        body.lng ?? null,
        body.reporterId ?? null,
        body.reportId ?? null,
        user.id,
      ]
    );

    const full = await queryOne<IncidentRow>(`${INCIDENT_SELECT} WHERE i.id = $1`, [incident!.id]);
    const mapped = mapIncident(full!);

    emitToCommand('incident_created', mapped);
    await logActivity({
      userId: user.id,
      type: 'incident_created',
      message: `Insiden "${body.title}" dibuat oleh ${user.fullName}`,
      refType: 'incident',
      refId: incident!.id,
    });
    await notify({
      type: 'incident_created',
      title: 'Insiden Baru',
      body: `${body.title}${body.location ? ` — ${body.location}` : ''}`,
      severity: body.priority === 'critical' ? 'danger' : 'warning',
      refType: 'incident',
      refId: incident!.id,
    });
    await broadcastStats();

    res.status(201).json({ incident: mapped });
  })
);

const assignSchema = z.object({ assigneeId: z.number().int().positive() });

router.post(
  '/:id/assign',
  asyncHandler(async (req, res) => {
    const id = z.coerce.number().int().positive().parse(req.params.id);
    const { assigneeId } = assignSchema.parse(req.body);

    const updated = await queryOne<{ id: number; title: string }>(
      `UPDATE incidents SET assignee_id = $2,
              status = CASE WHEN status = 'open' THEN 'investigating' ELSE status END
        WHERE id = $1 RETURNING id, title`,
      [id, assigneeId]
    );
    if (!updated) return res.status(404).json({ error: 'Insiden tidak ditemukan' });

    const full = await queryOne<IncidentRow>(`${INCIDENT_SELECT} WHERE i.id = $1`, [id]);
    emitToCommand('incident_updated', mapIncident(full!));

    await notify({
      userId: assigneeId,
      type: 'incident_assigned',
      title: 'Penanganan Insiden',
      body: updated.title,
      severity: 'warning',
      refType: 'incident',
      refId: id,
    });
    emitToUser(assigneeId, 'incident_updated', mapIncident(full!));

    res.json({ incident: mapIncident(full!) });
  })
);

/** Blueprint route: POST /incidents/close { incidentId }. */
router.post(
  '/close',
  asyncHandler(async (req, res) => {
    const { incidentId } = z.object({ incidentId: z.number().int().positive() }).parse(req.body);
    return closeIncident(incidentId, req, res);
  })
);

router.post(
  '/:id/close',
  asyncHandler(async (req, res) => {
    const id = z.coerce.number().int().positive().parse(req.params.id);
    return closeIncident(id, req, res);
  })
);

async function closeIncident(
  id: number,
  req: import('express').Request,
  res: import('express').Response
) {
  const user = req.user!;

  const updated = await queryOne<{ id: number; title: string }>(
    `UPDATE incidents SET status = 'closed', closed_at = NOW() WHERE id = $1 RETURNING id, title`,
    [id]
  );
  if (!updated) return res.status(404).json({ error: 'Insiden tidak ditemukan' });

  const full = await queryOne<IncidentRow>(`${INCIDENT_SELECT} WHERE i.id = $1`, [id]);
  emitToCommand('incident_updated', mapIncident(full!));

  await logActivity({
    userId: user.id,
    type: 'incident_closed',
    message: `${user.fullName} menutup insiden "${updated.title}"`,
    refType: 'incident',
    refId: id,
  });
  await broadcastStats();

  return res.json({ incident: mapIncident(full!) });
}

export default router;
