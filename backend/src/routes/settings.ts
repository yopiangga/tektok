import bcrypt from 'bcryptjs';
import { Router } from 'express';
import { z } from 'zod';
import { env } from '../config/env';
import { query, queryOne } from '../db/pool';
import { requireAuth, requireCommand, requireRole } from '../middleware/auth';
import { asyncHandler } from '../middleware/error';
import { emitToCommand } from '../realtime/io';
import { logActivity, logSystem } from '../services/activity';

const router = Router();
router.use(requireAuth, requireCommand);

/* ------------------------------------------------------------- overview --- */

router.get(
  '/',
  asyncHandler(async (_req, res) => {
    const counts = await queryOne<Record<string, string>>(`
      SELECT
        (SELECT COUNT(*) FROM users u JOIN roles r ON r.id = u.role_id
          WHERE r.code = 'personnel')                        AS personnel,
        (SELECT COUNT(*) FROM users u JOIN roles r ON r.id = u.role_id
          WHERE r.code = 'superuser')                        AS command,
        (SELECT COUNT(*) FROM units)                         AS units,
        (SELECT COUNT(*) FROM operations WHERE status = 'active') AS operations
    `);

    res.json({
      counts: {
        personnel: Number(counts?.personnel ?? 0),
        command: Number(counts?.command ?? 0),
        units: Number(counts?.units ?? 0),
        operations: Number(counts?.operations ?? 0),
      },
      // Runtime policy lives in the environment; surfaced read-only so operators
      // can see the thresholds that drive presence without shell access.
      policy: {
        idleAfterSeconds: env.idleAfterSeconds,
        offlineAfterSeconds: env.offlineAfterSeconds,
        lowBatteryThreshold: env.lowBatteryThreshold,
        storage: env.minio.enabled ? 'minio' : 'local-disk',
        streaming: env.livekit.enabled ? 'livekit' : 'preview-only',
      },
    });
  })
);

/* ------------------------------------------------------------ operation --- */

router.get(
  '/operations',
  asyncHandler(async (_req, res) => {
    const rows = await query(
      `SELECT id, name, code, description, status, center_lat, center_lng, started_at, ended_at
         FROM operations ORDER BY started_at DESC`
    );
    res.json({
      operations: rows.map((o) => ({
        id: o.id,
        name: o.name,
        code: o.code,
        description: o.description,
        status: o.status,
        center: { lat: o.center_lat, lng: o.center_lng },
        startedAt: o.started_at,
        endedAt: o.ended_at,
      })),
    });
  })
);

const operationSchema = z.object({
  name: z.string().min(1, 'Nama operasi wajib diisi').max(200),
  code: z.string().min(1, 'Kode operasi wajib diisi').max(50),
  description: z.string().max(2000).optional(),
  centerLat: z.number().min(-90).max(90),
  centerLng: z.number().min(-180).max(180),
});

router.post(
  '/operations',
  requireRole('superuser'),
  asyncHandler(async (req, res) => {
    const body = operationSchema.parse(req.body);
    const user = req.user!;

    const existing = await queryOne('SELECT id FROM operations WHERE lower(code) = lower($1)', [
      body.code,
    ]);
    if (existing) return res.status(409).json({ error: 'Kode operasi sudah digunakan' });

    // Exactly one operation may be active: `operations.status` defaults to
    // 'active', so without this a new operation would quietly become a second
    // active row and the "current operation" lookup would turn ambiguous.
    const demoted = await query<{ id: number }>(
      `UPDATE operations SET status = 'closed', ended_at = COALESCE(ended_at, NOW())
        WHERE status = 'active' RETURNING id`
    );

    const row = await queryOne<{ id: number }>(
      `INSERT INTO operations (name, code, description, center_lat, center_lng)
       VALUES ($1,$2,$3,$4,$5) RETURNING id`,
      [body.name, body.code, body.description ?? null, body.centerLat, body.centerLng]
    );

    await logSystem({
      userId: user.id,
      action: 'operation.create',
      entity: 'operation',
      entityId: row!.id,
      ip: req.ip,
      meta: { closedPrevious: demoted.map((d) => d.id) },
    });
    await logActivity({
      userId: user.id,
      type: 'operation_created',
      message: `${user.fullName} membuat operasi "${body.name}"`,
      refType: 'operation',
      refId: row!.id,
    });

    res.status(201).json({ id: row!.id });
  })
);

const operationPatchSchema = operationSchema.partial().extend({
  status: z.enum(['active', 'closed']).optional(),
});

router.patch(
  '/operations/:id',
  requireRole('superuser'),
  asyncHandler(async (req, res) => {
    const id = z.coerce.number().int().positive().parse(req.params.id);
    const body = operationPatchSchema.parse(req.body);

    const sets: string[] = [];
    const params: unknown[] = [id];
    const push = (column: string, value: unknown) => {
      params.push(value);
      sets.push(`${column} = $${params.length}`);
    };

    if (body.name !== undefined) push('name', body.name);
    if (body.code !== undefined) push('code', body.code);
    if (body.description !== undefined) push('description', body.description);
    if (body.centerLat !== undefined) push('center_lat', body.centerLat);
    if (body.centerLng !== undefined) push('center_lng', body.centerLng);
    if (body.status !== undefined) {
      push('status', body.status);
      if (body.status === 'closed') sets.push('ended_at = NOW()');
    }
    if (!sets.length) return res.status(400).json({ error: 'Tidak ada perubahan' });

    const updated = await queryOne<{ id: number }>(
      `UPDATE operations SET ${sets.join(', ')} WHERE id = $1 RETURNING id`,
      params
    );
    if (!updated) return res.status(404).json({ error: 'Operasi tidak ditemukan' });

    await logSystem({
      userId: req.user!.id,
      action: 'operation.update',
      entity: 'operation',
      entityId: id,
      ip: req.ip,
      meta: body,
    });

    res.json({ ok: true });
  })
);

/**
 * Switch the operation everything new attaches to.
 *
 * Reports, missions and incidents resolve their operation with
 * `status = 'active' ORDER BY started_at DESC LIMIT 1`, so two active rows make
 * the target ambiguous — whichever started later silently wins. Activating is
 * therefore exclusive: the chosen operation becomes active and every other one
 * is closed, which keeps the single-operation model the blueprint specifies
 * (multi-operation support is explicitly out of scope for v1).
 */
router.post(
  '/operations/:id/activate',
  requireRole('superuser'),
  asyncHandler(async (req, res) => {
    const id = z.coerce.number().int().positive().parse(req.params.id);
    const user = req.user!;

    const target = await queryOne<{ id: number; name: string }>(
      'SELECT id, name FROM operations WHERE id = $1',
      [id]
    );
    if (!target) return res.status(404).json({ error: 'Operasi tidak ditemukan' });

    const demoted = await query<{ id: number }>(
      `UPDATE operations SET status = 'closed', ended_at = COALESCE(ended_at, NOW())
        WHERE id <> $1 AND status = 'active' RETURNING id`,
      [id]
    );

    await queryOne(
      `UPDATE operations SET status = 'active', ended_at = NULL WHERE id = $1 RETURNING id`,
      [id]
    );

    await logSystem({
      userId: user.id,
      action: 'operation.activate',
      entity: 'operation',
      entityId: id,
      ip: req.ip,
      meta: { demoted: demoted.map((d) => d.id) },
    });
    await logActivity({
      userId: user.id,
      type: 'operation_activated',
      message: `${user.fullName} mengaktifkan operasi "${target.name}"`,
      refType: 'operation',
      refId: id,
    });

    res.json({ ok: true, activated: id, closed: demoted.map((d) => d.id) });
  })
);

/** Records that would be detached (not deleted) by removing this operation. */
router.get(
  '/operations/:id/impact',
  requireRole('superuser'),
  asyncHandler(async (req, res) => {
    const id = z.coerce.number().int().positive().parse(req.params.id);

    const op = await queryOne<{ name: string; status: string }>(
      'SELECT name, status FROM operations WHERE id = $1',
      [id]
    );
    if (!op) return res.status(404).json({ error: 'Operasi tidak ditemukan' });

    const row = await queryOne<Record<string, string>>(
      `SELECT
         (SELECT COUNT(*) FROM reports   WHERE operation_id = $1) AS reports,
         (SELECT COUNT(*) FROM missions  WHERE operation_id = $1) AS missions,
         (SELECT COUNT(*) FROM incidents WHERE operation_id = $1) AS incidents`,
      [id]
    );

    const counts = {
      reports: Number(row?.reports ?? 0),
      missions: Number(row?.missions ?? 0),
      incidents: Number(row?.incidents ?? 0),
    };

    res.json({
      name: op.name,
      isActive: op.status === 'active',
      counts,
      total: Object.values(counts).reduce((a, b) => a + b, 0),
    });
  })
);

router.delete(
  '/operations/:id',
  requireRole('superuser'),
  asyncHandler(async (req, res) => {
    const id = z.coerce.number().int().positive().parse(req.params.id);
    const user = req.user!;

    const op = await queryOne<{ name: string; status: string }>(
      'SELECT name, status FROM operations WHERE id = $1',
      [id]
    );
    if (!op) return res.status(404).json({ error: 'Operasi tidak ditemukan' });

    // Deleting the operation currently in use would leave new reports and
    // missions with no operation at all; switch first so the target is explicit.
    if (op.status === 'active') {
      return res.status(409).json({
        error:
          `"${op.name}" sedang aktif. Alihkan ke operasi lain terlebih dahulu, ` +
          'lalu hapus operasi ini.',
        hint: 'switch-first',
      });
    }

    // The foreign keys are ON DELETE SET NULL, so the records survive and are
    // merely detached — worth stating plainly rather than implying data loss.
    const row = await queryOne<Record<string, string>>(
      `SELECT
         (SELECT COUNT(*) FROM reports   WHERE operation_id = $1) AS reports,
         (SELECT COUNT(*) FROM missions  WHERE operation_id = $1) AS missions,
         (SELECT COUNT(*) FROM incidents WHERE operation_id = $1) AS incidents`,
      [id]
    );
    const detached = {
      reports: Number(row?.reports ?? 0),
      missions: Number(row?.missions ?? 0),
      incidents: Number(row?.incidents ?? 0),
    };

    await queryOne('DELETE FROM operations WHERE id = $1 RETURNING id', [id]);

    await logSystem({
      userId: user.id,
      action: 'operation.delete',
      entity: 'operation',
      entityId: id,
      ip: req.ip,
      meta: { name: op.name, detached },
    });
    await logActivity({
      userId: user.id,
      type: 'operation_deleted',
      message: `${user.fullName} menghapus operasi "${op.name}"`,
      refType: 'operation',
      refId: id,
    });

    res.json({ ok: true, deleted: id, detached });
  })
);

/* ---------------------------------------------------------------- units --- */

router.get(
  '/units',
  asyncHandler(async (_req, res) => {
    const rows = await query(
      `SELECT un.id, un.code, un.name, un.color,
              COUNT(u.id) FILTER (WHERE u.is_active) AS members
         FROM units un LEFT JOIN users u ON u.unit_id = un.id
        GROUP BY un.id ORDER BY un.code`
    );
    res.json({
      units: rows.map((u) => ({
        id: u.id,
        code: u.code,
        name: u.name,
        color: u.color,
        members: Number(u.members),
      })),
    });
  })
);

const unitSchema = z.object({
  code: z.string().min(1, 'Kode unit wajib diisi').max(30),
  name: z.string().min(1, 'Nama unit wajib diisi').max(120),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, 'Warna harus berformat heksadesimal, contoh #2563EB')
    .default('#2563EB'),
});

router.post(
  '/units',
  requireRole('superuser'),
  asyncHandler(async (req, res) => {
    const body = unitSchema.parse(req.body);

    const existing = await queryOne('SELECT id FROM units WHERE lower(code) = lower($1)', [body.code]);
    if (existing) return res.status(409).json({ error: 'Kode unit sudah digunakan' });

    const row = await queryOne<{ id: number }>(
      'INSERT INTO units (code, name, color) VALUES ($1,$2,$3) RETURNING id',
      [body.code.toUpperCase(), body.name, body.color]
    );

    await logSystem({
      userId: req.user!.id,
      action: 'unit.create',
      entity: 'unit',
      entityId: row!.id,
      ip: req.ip,
    });

    res.status(201).json({ id: row!.id });
  })
);

router.patch(
  '/units/:id',
  requireRole('superuser'),
  asyncHandler(async (req, res) => {
    const id = z.coerce.number().int().positive().parse(req.params.id);
    const body = unitSchema.partial().parse(req.body);

    const sets: string[] = [];
    const params: unknown[] = [id];
    const push = (column: string, value: unknown) => {
      params.push(value);
      sets.push(`${column} = $${params.length}`);
    };

    if (body.code !== undefined) push('code', body.code.toUpperCase());
    if (body.name !== undefined) push('name', body.name);
    if (body.color !== undefined) push('color', body.color);
    if (!sets.length) return res.status(400).json({ error: 'Tidak ada perubahan' });

    const updated = await queryOne<{ id: number }>(
      `UPDATE units SET ${sets.join(', ')} WHERE id = $1 RETURNING id`,
      params
    );
    if (!updated) return res.status(404).json({ error: 'Unit tidak ditemukan' });

    await logSystem({
      userId: req.user!.id,
      action: 'unit.update',
      entity: 'unit',
      entityId: id,
      ip: req.ip,
    });

    res.json({ ok: true });
  })
);

router.delete(
  '/units/:id',
  requireRole('superuser'),
  asyncHandler(async (req, res) => {
    const id = z.coerce.number().int().positive().parse(req.params.id);

    // Members are detached rather than deleted; personnel records must survive.
    const members = await queryOne<{ count: string }>(
      'SELECT COUNT(*) AS count FROM users WHERE unit_id = $1',
      [id]
    );

    const deleted = await queryOne<{ id: number }>('DELETE FROM units WHERE id = $1 RETURNING id', [
      id,
    ]);
    if (!deleted) return res.status(404).json({ error: 'Unit tidak ditemukan' });

    await logSystem({
      userId: req.user!.id,
      action: 'unit.delete',
      entity: 'unit',
      entityId: id,
      ip: req.ip,
      meta: { detachedMembers: Number(members?.count ?? 0) },
    });

    res.json({ ok: true, detachedMembers: Number(members?.count ?? 0) });
  })
);

/* ---------------------------------------------------------------- users --- */

router.get(
  '/users',
  requireRole('superuser'),
  asyncHandler(async (req, res) => {
    const filters = z
      .object({
        role: z.enum(['superuser', 'personnel', 'drone', 'screen']).optional(),
        q: z.string().max(100).optional(),
      })
      .parse(req.query);

    const clauses: string[] = [];
    const params: unknown[] = [];

    if (filters.role) {
      params.push(filters.role);
      clauses.push(`r.code = $${params.length}`);
    }
    if (filters.q) {
      params.push(`%${filters.q}%`);
      clauses.push(
        `(u.full_name ILIKE $${params.length} OR u.username ILIKE $${params.length} OR u.badge_number ILIKE $${params.length})`
      );
    }

    const rows = await query(
      `SELECT u.id, u.username, u.full_name, u.phone, u.badge_number, u.is_active,
              u.status, u.created_at, r.code AS role, un.id AS unit_id, un.name AS unit_name
         FROM users u
         JOIN roles r ON r.id = u.role_id
         LEFT JOIN units un ON un.id = u.unit_id
        ${clauses.length ? `WHERE ${clauses.join(' AND ')}` : ''}
        ORDER BY CASE r.code WHEN 'superuser' THEN 0 ELSE 1 END, u.full_name
        LIMIT 300`,
      params
    );

    res.json({
      users: rows.map((u) => ({
        id: u.id,
        username: u.username,
        fullName: u.full_name,
        phone: u.phone,
        badgeNumber: u.badge_number,
        isActive: u.is_active,
        status: u.status,
        role: u.role,
        unit: u.unit_id ? { id: u.unit_id, name: u.unit_name } : null,
        createdAt: u.created_at,
      })),
    });
  })
);

const userSchema = z.object({
  username: z
    .string()
    .min(3, 'Username minimal 3 karakter')
    .max(64)
    .regex(/^[a-zA-Z0-9._-]+$/, 'Username hanya boleh huruf, angka, titik, garis bawah, dan strip'),
  password: z.string().min(8, 'Password minimal 8 karakter').max(128),
  fullName: z.string().min(1, 'Nama lengkap wajib diisi').max(200),
  phone: z.string().max(30).optional(),
  badgeNumber: z.string().max(50).optional(),
  role: z.enum(['superuser', 'personnel', 'drone', 'screen']),
  unitId: z.number().int().positive().nullable().optional(),
});

router.post(
  '/users',
  requireRole('superuser'),
  asyncHandler(async (req, res) => {
    const body = userSchema.parse(req.body);

    const existing = await queryOne('SELECT id FROM users WHERE lower(username) = lower($1)', [
      body.username,
    ]);
    if (existing) return res.status(409).json({ error: 'Username sudah digunakan' });

    const role = await queryOne<{ id: number }>('SELECT id FROM roles WHERE code = $1', [body.role]);
    if (!role) return res.status(400).json({ error: 'Peran tidak dikenal' });

    const row = await queryOne<{ id: number }>(
      `INSERT INTO users (username, password_hash, full_name, phone, badge_number, role_id, unit_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
      [
        body.username.toLowerCase(),
        await bcrypt.hash(body.password, 10),
        body.fullName,
        body.phone ?? null,
        body.badgeNumber ?? null,
        role.id,
        body.role === 'superuser' ? null : (body.unitId ?? null),
      ]
    );

    await logSystem({
      userId: req.user!.id,
      action: 'user.create',
      entity: 'user',
      entityId: row!.id,
      ip: req.ip,
      meta: { username: body.username, role: body.role },
    });
    emitToCommand('activity', {
      id: Date.now(),
      type: 'user_created',
      message: `${req.user!.fullName} menambahkan pengguna ${body.fullName}`,
      createdAt: new Date().toISOString(),
    });

    res.status(201).json({ id: row!.id });
  })
);

const userPatchSchema = z.object({
  fullName: z.string().min(1).max(200).optional(),
  phone: z.string().max(30).nullable().optional(),
  badgeNumber: z.string().max(50).nullable().optional(),
  unitId: z.number().int().positive().nullable().optional(),
  isActive: z.boolean().optional(),
  password: z.string().min(8, 'Password minimal 8 karakter').max(128).optional(),
});

router.patch(
  '/users/:id',
  requireRole('superuser'),
  asyncHandler(async (req, res) => {
    const id = z.coerce.number().int().positive().parse(req.params.id);
    const body = userPatchSchema.parse(req.body);

    // A commander must not be able to lock themselves out of the system.
    if (id === req.user!.id && body.isActive === false) {
      return res.status(400).json({ error: 'Tidak dapat menonaktifkan akun sendiri' });
    }

    const sets: string[] = [];
    const params: unknown[] = [id];
    const push = (column: string, value: unknown) => {
      params.push(value);
      sets.push(`${column} = $${params.length}`);
    };

    if (body.fullName !== undefined) push('full_name', body.fullName);
    if (body.phone !== undefined) push('phone', body.phone);
    if (body.badgeNumber !== undefined) push('badge_number', body.badgeNumber);
    if (body.unitId !== undefined) push('unit_id', body.unitId);
    if (body.isActive !== undefined) push('is_active', body.isActive);
    if (body.password !== undefined) push('password_hash', await bcrypt.hash(body.password, 10));
    if (!sets.length) return res.status(400).json({ error: 'Tidak ada perubahan' });

    const updated = await queryOne<{ id: number }>(
      `UPDATE users SET ${sets.join(', ')}, updated_at = NOW() WHERE id = $1 RETURNING id`,
      params
    );
    if (!updated) return res.status(404).json({ error: 'Pengguna tidak ditemukan' });

    await logSystem({
      userId: req.user!.id,
      action: body.password ? 'user.reset_password' : 'user.update',
      entity: 'user',
      entityId: id,
      ip: req.ip,
      // Never log the password itself.
      meta: { ...body, password: body.password ? '[redacted]' : undefined },
    });

    res.json({ ok: true });
  })
);

/**
 * Operational history a hard delete would take with it. `reports` cascades from
 * `users`, so removing a person also erases their field reports and the media
 * attached to them — evidence the operation may still need.
 */
async function historyOf(userId: number) {
  const row = await queryOne<Record<string, string>>(
    `SELECT
       (SELECT COUNT(*) FROM reports              WHERE user_id = $1) AS reports,
       (SELECT COUNT(*) FROM mission_assignments  WHERE user_id = $1) AS missions,
       (SELECT COUNT(*) FROM streams              WHERE user_id = $1) AS streams,
       (SELECT COUNT(*) FROM messages
         WHERE sender_id = $1 OR receiver_id = $1)                    AS messages`,
    [userId]
  );

  const counts = {
    reports: Number(row?.reports ?? 0),
    missions: Number(row?.missions ?? 0),
    streams: Number(row?.streams ?? 0),
    messages: Number(row?.messages ?? 0),
  };

  return { counts, total: Object.values(counts).reduce((a, b) => a + b, 0) };
}

/** What a delete would destroy — lets the UI warn before anything happens. */
router.get(
  '/users/:id/impact',
  requireRole('superuser'),
  asyncHandler(async (req, res) => {
    const id = z.coerce.number().int().positive().parse(req.params.id);
    const user = await queryOne<{ full_name: string }>('SELECT full_name FROM users WHERE id = $1', [
      id,
    ]);
    if (!user) return res.status(404).json({ error: 'Pengguna tidak ditemukan' });

    const { counts, total } = await historyOf(id);
    res.json({ fullName: user.full_name, counts, total, deletableCleanly: total === 0 });
  })
);

router.delete(
  '/users/:id',
  requireRole('superuser'),
  asyncHandler(async (req, res) => {
    const id = z.coerce.number().int().positive().parse(req.params.id);
    const force = req.query.force === 'true';
    const actor = req.user!;

    if (id === actor.id) {
      return res.status(400).json({ error: 'Tidak dapat menghapus akun sendiri' });
    }

    const target = await queryOne<{ full_name: string; username: string }>(
      'SELECT full_name, username FROM users WHERE id = $1',
      [id]
    );
    if (!target) return res.status(404).json({ error: 'Pengguna tidak ditemukan' });

    const { counts, total } = await historyOf(id);

    // Refuse by default when there is history: deactivating keeps the account
    // out of the operation without discarding records that may be evidence.
    if (total > 0 && !force) {
      return res.status(409).json({
        error:
          `${target.full_name} memiliki riwayat operasional (${counts.reports} laporan, ` +
          `${counts.missions} penugasan, ${counts.streams} siaran, ${counts.messages} pesan). ` +
          'Nonaktifkan akun untuk mengeluarkannya dari operasi tanpa menghapus riwayat.',
        counts,
        total,
        hint: 'deactivate',
      });
    }

    await queryOne('DELETE FROM users WHERE id = $1 RETURNING id', [id]);

    await logSystem({
      userId: actor.id,
      action: force && total > 0 ? 'user.delete_forced' : 'user.delete',
      entity: 'user',
      entityId: id,
      ip: req.ip,
      meta: { username: target.username, fullName: target.full_name, destroyed: counts },
    });
    await logActivity({
      userId: actor.id,
      type: 'user_deleted',
      message: `${actor.fullName} menghapus pengguna ${target.full_name}`,
      refType: 'user',
      refId: id,
    });

    res.json({ ok: true, deleted: id, destroyed: counts });
  })
);

/* ------------------------------------------------------------ audit log --- */

router.get(
  '/audit',
  asyncHandler(async (req, res) => {
    const limit = z.coerce.number().int().min(1).max(200).default(60).parse(req.query.limit ?? 60);

    const rows = await query(
      `SELECT s.id, s.action, s.entity, s.entity_id, s.ip, s.created_at, u.full_name
         FROM system_logs s LEFT JOIN users u ON u.id = s.user_id
        ORDER BY s.created_at DESC LIMIT $1`,
      [limit]
    );

    res.json({
      logs: rows.map((l) => ({
        id: l.id,
        action: l.action,
        entity: l.entity,
        entityId: l.entity_id,
        ip: l.ip,
        userName: l.full_name,
        createdAt: l.created_at,
      })),
    });
  })
);

export default router;
