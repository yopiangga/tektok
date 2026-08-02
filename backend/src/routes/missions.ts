import { Router } from 'express';
import { z } from 'zod';
import { query, queryOne } from '../db/pool';
import { requireAuth, requireCommand } from '../middleware/auth';
import { isFieldRole } from '../types';
import { asyncHandler } from '../middleware/error';
import { emitToCommand, emitToUser } from '../realtime/io';
import { logActivity } from '../services/activity';
import { notify } from '../services/notify';
import { broadcastStats } from '../services/stats';

const router = Router();
router.use(requireAuth);

const MISSION_SELECT = `
  SELECT m.id, m.title, m.description, m.priority, m.status, m.lat, m.lng,
         m.deadline, m.created_at, m.completed_at,
         c.full_name AS commander_name,
         COALESCE(
           (SELECT json_agg(json_build_object(
              'id', u.id, 'fullName', u.full_name, 'badgeNumber', u.badge_number,
              'unitName', un.name, 'status', ma.status))
              FROM mission_assignments ma
              JOIN users u ON u.id = ma.user_id
              LEFT JOIN units un ON un.id = u.unit_id
             WHERE ma.mission_id = m.id),
           '[]'::json
         ) AS assignees
    FROM missions m
    LEFT JOIN users c ON c.id = m.created_by
`;

interface MissionRow {
  id: number;
  title: string;
  description: string | null;
  priority: string;
  status: string;
  lat: number | null;
  lng: number | null;
  deadline: string | null;
  created_at: string;
  completed_at: string | null;
  commander_name: string | null;
  assignees: Array<{
    id: number;
    fullName: string;
    badgeNumber: string | null;
    unitName: string | null;
    status: string;
  }>;
}

const mapMission = (m: MissionRow) => ({
  id: m.id,
  title: m.title,
  description: m.description,
  priority: m.priority,
  status: m.status,
  lat: m.lat,
  lng: m.lng,
  deadline: m.deadline,
  createdAt: m.created_at,
  completedAt: m.completed_at,
  commanderName: m.commander_name,
  assignees: m.assignees ?? [],
});

const listSchema = z.object({
  status: z.enum(['pending', 'running', 'completed', 'cancelled']).optional(),
  priority: z.enum(['low', 'medium', 'high', 'critical']).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const filters = listSchema.parse(req.query);
    const clauses: string[] = [];
    const params: unknown[] = [];

    if (isFieldRole(req.user!.role)) {
      params.push(req.user!.id);
      clauses.push(
        `EXISTS (SELECT 1 FROM mission_assignments ma WHERE ma.mission_id = m.id AND ma.user_id = $${params.length})`
      );
    }
    if (filters.status) {
      params.push(filters.status);
      clauses.push(`m.status = $${params.length}`);
    }
    if (filters.priority) {
      params.push(filters.priority);
      clauses.push(`m.priority = $${params.length}`);
    }

    params.push(filters.limit);
    const rows = await query<MissionRow>(
      `${MISSION_SELECT} ${clauses.length ? `WHERE ${clauses.join(' AND ')}` : ''}
       ORDER BY CASE m.status WHEN 'running' THEN 0 WHEN 'pending' THEN 1 ELSE 2 END,
                CASE m.priority WHEN 'critical' THEN 0 WHEN 'high' THEN 1
                                WHEN 'medium' THEN 2 ELSE 3 END,
                m.created_at DESC
       LIMIT $${params.length}`,
      params
    );

    res.json({ missions: rows.map(mapMission) });
  })
);

router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = z.coerce.number().int().positive().parse(req.params.id);
    const row = await queryOne<MissionRow>(`${MISSION_SELECT} WHERE m.id = $1`, [id]);
    if (!row) return res.status(404).json({ error: 'Misi tidak ditemukan' });

    if (isFieldRole(req.user!.role)) {
      const assigned = (row.assignees ?? []).some((a) => a.id === req.user!.id);
      if (!assigned) return res.status(403).json({ error: 'Misi ini tidak ditugaskan kepada Anda' });
    }

    res.json({ mission: mapMission(row) });
  })
);

const createSchema = z.object({
  title: z.string().min(1, 'Judul misi wajib diisi').max(200),
  description: z.string().max(4000).optional(),
  priority: z.enum(['low', 'medium', 'high', 'critical']).default('medium'),
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
  deadline: z.string().datetime().optional(),
  assigneeIds: z.array(z.number().int().positive()).default([]),
});

router.post(
  '/',
  requireCommand,
  asyncHandler(async (req, res) => {
    const body = createSchema.parse(req.body);
    const user = req.user!;

    const operation = await queryOne<{ id: number }>(
      `SELECT id FROM operations WHERE status = 'active' ORDER BY started_at DESC LIMIT 1`
    );

    const mission = await queryOne<{ id: number }>(
      `INSERT INTO missions (operation_id, title, description, priority, lat, lng, deadline, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
      [
        operation?.id ?? null,
        body.title,
        body.description ?? null,
        body.priority,
        body.lat ?? null,
        body.lng ?? null,
        body.deadline ?? null,
        user.id,
      ]
    );

    for (const uid of body.assigneeIds) {
      await queryOne(
        `INSERT INTO mission_assignments (mission_id, user_id) VALUES ($1,$2)
         ON CONFLICT DO NOTHING RETURNING id`,
        [mission!.id, uid]
      );
      await notify({
        userId: uid,
        type: 'mission_assigned',
        title: 'Misi Baru',
        body: body.title,
        severity: 'info',
        refType: 'mission',
        refId: mission!.id,
      });
      emitToUser(uid, 'mission_assigned', { missionId: mission!.id, title: body.title });
    }

    const full = await queryOne<MissionRow>(`${MISSION_SELECT} WHERE m.id = $1`, [mission!.id]);
    const mapped = mapMission(full!);

    emitToCommand('mission_created', mapped);
    await logActivity({
      userId: user.id,
      type: 'mission_created',
      message: `${user.fullName} membuat misi "${body.title}"`,
      refType: 'mission',
      refId: mission!.id,
    });
    await broadcastStats();

    res.status(201).json({ mission: mapped });
  })
);

const assignSchema = z.object({
  missionId: z.number().int().positive(),
  assigneeIds: z.array(z.number().int().positive()).min(1, 'Pilih minimal satu personel'),
});

router.post(
  '/assign',
  requireCommand,
  asyncHandler(async (req, res) => {
    const body = assignSchema.parse(req.body);
    const user = req.user!;

    const mission = await queryOne<{ id: number; title: string }>(
      'SELECT id, title FROM missions WHERE id = $1',
      [body.missionId]
    );
    if (!mission) return res.status(404).json({ error: 'Misi tidak ditemukan' });

    for (const uid of body.assigneeIds) {
      await queryOne(
        `INSERT INTO mission_assignments (mission_id, user_id) VALUES ($1,$2)
         ON CONFLICT DO NOTHING RETURNING id`,
        [mission.id, uid]
      );
      await notify({
        userId: uid,
        type: 'mission_assigned',
        title: 'Misi Baru',
        body: mission.title,
        severity: 'info',
        refType: 'mission',
        refId: mission.id,
      });
      emitToUser(uid, 'mission_assigned', { missionId: mission.id, title: mission.title });
    }

    const full = await queryOne<MissionRow>(`${MISSION_SELECT} WHERE m.id = $1`, [mission.id]);
    emitToCommand('mission_created', mapMission(full!));
    await logActivity({
      userId: user.id,
      type: 'mission_assigned',
      message: `${user.fullName} menugaskan ${body.assigneeIds.length} personel ke "${mission.title}"`,
      refType: 'mission',
      refId: mission.id,
    });

    res.json({ mission: mapMission(full!) });
  })
);

/** Personnel accepts an assignment → mission moves to running. */
router.post(
  '/:id/accept',
  asyncHandler(async (req, res) => {
    const id = z.coerce.number().int().positive().parse(req.params.id);
    const user = req.user!;

    const assignment = await queryOne<{ id: number }>(
      `UPDATE mission_assignments SET status = 'accepted', accepted_at = NOW()
        WHERE mission_id = $1 AND user_id = $2 AND status = 'assigned' RETURNING id`,
      [id, user.id]
    );
    if (!assignment) return res.status(404).json({ error: 'Penugasan tidak ditemukan' });

    await queryOne(
      `UPDATE missions SET status = 'running', updated_at = NOW()
        WHERE id = $1 AND status = 'pending' RETURNING id`,
      [id]
    );

    const full = await queryOne<MissionRow>(`${MISSION_SELECT} WHERE m.id = $1`, [id]);
    emitToCommand('mission_created', mapMission(full!));
    await logActivity({
      userId: user.id,
      type: 'mission_accepted',
      message: `${user.fullName} menerima misi "${full!.title}"`,
      refType: 'mission',
      refId: id,
    });
    await broadcastStats();

    res.json({ mission: mapMission(full!) });
  })
);

async function completeMission(missionId: number, userId: number, userName: string) {
  await queryOne(
    `UPDATE mission_assignments SET status = 'completed', completed_at = NOW()
      WHERE mission_id = $1 AND user_id = $2 RETURNING id`,
    [missionId, userId]
  );

  // The mission closes once every assignee has reported completion.
  const pending = await queryOne<{ count: string }>(
    `SELECT COUNT(*) AS count FROM mission_assignments
      WHERE mission_id = $1 AND status <> 'completed'`,
    [missionId]
  );

  if (Number(pending?.count ?? 0) === 0) {
    await queryOne(
      `UPDATE missions SET status = 'completed', completed_at = NOW(), updated_at = NOW()
        WHERE id = $1 RETURNING id`,
      [missionId]
    );
  }

  const full = await queryOne<MissionRow>(`${MISSION_SELECT} WHERE m.id = $1`, [missionId]);
  emitToCommand('mission_completed', mapMission(full!));

  await logActivity({
    userId,
    type: 'mission_completed',
    message: `${userName} menyelesaikan misi "${full!.title}"`,
    refType: 'mission',
    refId: missionId,
  });
  await notify({
    type: 'mission_completed',
    title: 'Misi Selesai',
    body: `${userName} menyelesaikan "${full!.title}".`,
    severity: 'success',
    refType: 'mission',
    refId: missionId,
  });
  await broadcastStats();

  return full!;
}

/** Blueprint route: POST /missions/complete { missionId }. */
router.post(
  '/complete',
  asyncHandler(async (req, res) => {
    const { missionId } = z.object({ missionId: z.number().int().positive() }).parse(req.body);
    const user = req.user!;

    const assigned = await queryOne<{ id: number }>(
      'SELECT id FROM mission_assignments WHERE mission_id = $1 AND user_id = $2',
      [missionId, user.id]
    );
    if (!assigned && isFieldRole(user.role)) {
      return res.status(403).json({ error: 'Misi ini tidak ditugaskan kepada Anda' });
    }

    const mission = await completeMission(missionId, user.id, user.fullName);
    res.json({ mission: mapMission(mission) });
  })
);

router.post(
  '/:id/complete',
  asyncHandler(async (req, res) => {
    const id = z.coerce.number().int().positive().parse(req.params.id);
    const user = req.user!;

    const assigned = await queryOne<{ id: number }>(
      'SELECT id FROM mission_assignments WHERE mission_id = $1 AND user_id = $2',
      [id, user.id]
    );
    if (!assigned && isFieldRole(user.role)) {
      return res.status(403).json({ error: 'Misi ini tidak ditugaskan kepada Anda' });
    }

    // Command staff can force-close a mission outright.
    if (!assigned) {
      await queryOne(
        `UPDATE missions SET status = 'completed', completed_at = NOW(), updated_at = NOW()
          WHERE id = $1 RETURNING id`,
        [id]
      );
      await queryOne(
        `UPDATE mission_assignments SET status = 'completed', completed_at = NOW()
          WHERE mission_id = $1 RETURNING id`,
        [id]
      );
      const full = await queryOne<MissionRow>(`${MISSION_SELECT} WHERE m.id = $1`, [id]);
      emitToCommand('mission_completed', mapMission(full!));
      await broadcastStats();
      return res.json({ mission: mapMission(full!) });
    }

    const mission = await completeMission(id, user.id, user.fullName);
    res.json({ mission: mapMission(mission) });
  })
);

const updateSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(4000).optional(),
  priority: z.enum(['low', 'medium', 'high', 'critical']).optional(),
  status: z.enum(['pending', 'running', 'completed', 'cancelled']).optional(),
  deadline: z.string().datetime().nullable().optional(),
});

router.patch(
  '/:id',
  requireCommand,
  asyncHandler(async (req, res) => {
    const id = z.coerce.number().int().positive().parse(req.params.id);
    const body = updateSchema.parse(req.body);

    const sets: string[] = [];
    const params: unknown[] = [id];
    const push = (column: string, value: unknown) => {
      params.push(value);
      sets.push(`${column} = $${params.length}`);
    };

    if (body.title !== undefined) push('title', body.title);
    if (body.description !== undefined) push('description', body.description);
    if (body.priority !== undefined) push('priority', body.priority);
    if (body.status !== undefined) push('status', body.status);
    if (body.deadline !== undefined) push('deadline', body.deadline);
    if (!sets.length) return res.status(400).json({ error: 'Tidak ada perubahan' });

    const updated = await queryOne<{ id: number }>(
      `UPDATE missions SET ${sets.join(', ')}, updated_at = NOW() WHERE id = $1 RETURNING id`,
      params
    );
    if (!updated) return res.status(404).json({ error: 'Misi tidak ditemukan' });

    const full = await queryOne<MissionRow>(`${MISSION_SELECT} WHERE m.id = $1`, [id]);
    emitToCommand('mission_created', mapMission(full!));
    await broadcastStats();

    res.json({ mission: mapMission(full!) });
  })
);

export default router;
