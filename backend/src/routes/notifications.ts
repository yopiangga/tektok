import { Router } from 'express';
import { z } from 'zod';
import { query, queryOne } from '../db/pool';
import { requireAuth } from '../middleware/auth';
import { isFieldRole } from '../types';
import { asyncHandler } from '../middleware/error';

const router = Router();
router.use(requireAuth);

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const limit = z.coerce.number().int().min(1).max(200).default(50).parse(req.query.limit ?? 50);
    const user = req.user!;

    const rows =
      isFieldRole(user.role)
        ? await query(
            `SELECT id, type, title, body, severity, ref_type, ref_id, read_at, created_at
               FROM notifications WHERE user_id = $1
              ORDER BY created_at DESC LIMIT $2`,
            [user.id, limit]
          )
        : await query(
            `SELECT id, type, title, body, severity, ref_type, ref_id, read_at, created_at
               FROM notifications WHERE audience = 'command'
              ORDER BY created_at DESC LIMIT $1`,
            [limit]
          );

    res.json({
      notifications: rows.map((n) => ({
        id: n.id,
        type: n.type,
        title: n.title,
        body: n.body,
        severity: n.severity,
        refType: n.ref_type,
        refId: n.ref_id,
        read: Boolean(n.read_at),
        createdAt: n.created_at,
      })),
      unread: rows.filter((n) => !n.read_at).length,
    });
  })
);

router.post(
  '/:id/read',
  asyncHandler(async (req, res) => {
    const id = z.coerce.number().int().positive().parse(req.params.id);
    const user = req.user!;

    await queryOne(
      `UPDATE notifications SET read_at = NOW()
        WHERE id = $1 AND (user_id = $2 OR (audience = 'command' AND $3))
        RETURNING id`,
      [id, user.id, !isFieldRole(user.role)]
    );

    res.json({ ok: true });
  })
);

router.post(
  '/read-all',
  asyncHandler(async (req, res) => {
    const user = req.user!;

    if (isFieldRole(user.role)) {
      await query('UPDATE notifications SET read_at = NOW() WHERE user_id = $1 AND read_at IS NULL', [
        user.id,
      ]);
    } else {
      await query(
        `UPDATE notifications SET read_at = NOW() WHERE audience = 'command' AND read_at IS NULL`
      );
    }

    res.json({ ok: true });
  })
);

export default router;
