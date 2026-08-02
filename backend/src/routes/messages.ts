import { Router } from 'express';
import { z } from 'zod';
import { query, queryOne } from '../db/pool';
import { requireAuth } from '../middleware/auth';
import { isFieldRole } from '../types';
import { asyncHandler } from '../middleware/error';
import { emitToUser } from '../realtime/io';

const router = Router();
router.use(requireAuth);

const mapMessage = (m: Record<string, unknown>) => ({
  id: m.id,
  senderId: m.sender_id,
  receiverId: m.receiver_id,
  senderName: m.sender_name,
  body: m.body,
  read: Boolean(m.read_at),
  createdAt: m.created_at,
});

/** Command inbox: one row per personnel that has an open conversation. */
router.get(
  '/threads',
  asyncHandler(async (req, res) => {
    const user = req.user!;
    if (isFieldRole(user.role)) {
      return res.status(403).json({ error: 'Tidak tersedia untuk personel' });
    }

    const rows = await query(
      `WITH convo AS (
         SELECT CASE WHEN m.sender_id = $1 THEN m.receiver_id ELSE m.sender_id END AS partner_id,
                m.body, m.created_at, m.read_at, m.sender_id
           FROM messages m
          WHERE m.sender_id = $1 OR m.receiver_id = $1
       ), latest AS (
         SELECT DISTINCT ON (partner_id) partner_id, body, created_at, sender_id
           FROM convo ORDER BY partner_id, created_at DESC
       )
       SELECT l.partner_id, l.body, l.created_at, l.sender_id,
              u.full_name, u.badge_number, u.status, un.name AS unit_name,
              (SELECT COUNT(*) FROM messages m2
                WHERE m2.sender_id = l.partner_id AND m2.receiver_id = $1 AND m2.read_at IS NULL
              ) AS unread
         FROM latest l
         JOIN users u ON u.id = l.partner_id
         LEFT JOIN units un ON un.id = u.unit_id
        ORDER BY l.created_at DESC`,
      [user.id]
    );

    res.json({
      threads: rows.map((r) => ({
        partner: {
          id: r.partner_id,
          fullName: r.full_name,
          badgeNumber: r.badge_number,
          unitName: r.unit_name,
          status: r.status,
        },
        lastMessage: r.body,
        lastMessageAt: r.created_at,
        unread: Number(r.unread ?? 0),
      })),
    });
  })
);

/** Personnel conversation with the command centre (no partner id needed). */
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const user = req.user!;
    const partnerId =
      isFieldRole(user.role)
        ? null
        : z.coerce.number().int().positive().parse(req.query.userId);

    const rows = partnerId
      ? await query(
          `SELECT m.*, s.full_name AS sender_name FROM messages m
             JOIN users s ON s.id = m.sender_id
            WHERE (m.sender_id = $1 AND m.receiver_id = $2)
               OR (m.sender_id = $2 AND m.receiver_id = $1)
            ORDER BY m.created_at ASC LIMIT 200`,
          [user.id, partnerId]
        )
      : await query(
          `SELECT m.*, s.full_name AS sender_name FROM messages m
             JOIN users s ON s.id = m.sender_id
            WHERE m.sender_id = $1 OR m.receiver_id = $1
            ORDER BY m.created_at ASC LIMIT 200`,
          [user.id]
        );

    // Mark everything addressed to the reader as read.
    await query(
      `UPDATE messages SET read_at = NOW()
        WHERE receiver_id = $1 AND read_at IS NULL
          ${partnerId ? 'AND sender_id = $2' : ''}`,
      partnerId ? [user.id, partnerId] : [user.id]
    );

    res.json({ messages: rows.map(mapMessage) });
  })
);

const sendSchema = z.object({
  receiverId: z.number().int().positive().optional(),
  body: z.string().min(1, 'Pesan tidak boleh kosong').max(2000),
});

router.post(
  '/',
  asyncHandler(async (req, res) => {
    const input = sendSchema.parse(req.body);
    const user = req.user!;

    let receiverId = input.receiverId ?? null;

    if (isFieldRole(user.role)) {
      // Personnel always talk to the command centre: prefer whoever replied last,
      // otherwise route to an on-duty operator, otherwise the commander.
      const lastPartner = await queryOne<{ sender_id: number }>(
        `SELECT sender_id FROM messages WHERE receiver_id = $1 ORDER BY created_at DESC LIMIT 1`,
        [user.id]
      );
      const fallback = await queryOne<{ id: number }>(
        `SELECT u.id FROM users u JOIN roles r ON r.id = u.role_id
          WHERE r.code = 'superuser' AND u.is_active
          ORDER BY CASE u.status WHEN 'online' THEN 0 ELSE 1 END, u.id
          LIMIT 1`
      );
      receiverId = lastPartner?.sender_id ?? fallback?.id ?? null;
      if (!receiverId) return res.status(503).json({ error: 'Tidak ada operator yang tersedia' });
    } else {
      if (!receiverId) return res.status(400).json({ error: 'Penerima wajib dipilih' });
    }

    const row = await queryOne(
      `INSERT INTO messages (sender_id, receiver_id, body) VALUES ($1,$2,$3)
       RETURNING id, sender_id, receiver_id, body, read_at, created_at`,
      [user.id, receiverId, input.body]
    );

    const payload = mapMessage({ ...row!, sender_name: user.fullName });
    emitToUser(receiverId, 'chat_message', payload);
    emitToUser(user.id, 'chat_message', payload);

    res.status(201).json({ message: payload });
  })
);

export default router;
