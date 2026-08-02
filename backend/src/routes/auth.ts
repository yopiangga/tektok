import bcrypt from 'bcryptjs';
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { env, isProd } from '../config/env';
import { queryOne } from '../db/pool';
import { TOKEN_COOKIE, requireAuth, signToken } from '../middleware/auth';
import { asyncHandler } from '../middleware/error';
import { emitToCommand } from '../realtime/io';
import { logActivity, logSystem } from '../services/activity';
import { isFieldRole, type RoleCode } from '../types';

const router = Router();

/** IPv6 clients get a /64 prefix so a single host cannot rotate addresses. */
function clientKey(ip: string | undefined): string {
  if (!ip) return 'unknown';
  if (!ip.includes(':')) return ip;
  return ip.split(':').slice(0, 4).join(':');
}

// Keyed on account + client rather than client alone: 100 personnel sharing one
// NAT egress must not lock each other out, while per-account brute force stays
// capped at 10 tries per 5 minutes.
const loginLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    const username = String((req.body as { username?: unknown } | undefined)?.username ?? '')
      .toLowerCase()
      .slice(0, 64);
    return `${clientKey(req.ip)}|${username}`;
  },
  message: { error: 'Terlalu banyak percobaan masuk, coba lagi dalam beberapa menit' },
});

const loginSchema = z.object({
  username: z.string().min(1, 'Username is required').max(64),
  password: z.string().min(1, 'Password is required').max(128),
});

router.post(
  '/login',
  loginLimiter,
  asyncHandler(async (req, res) => {
    const { username, password } = loginSchema.parse(req.body);

    const row = await queryOne<{
      id: number;
      username: string;
      password_hash: string;
      full_name: string;
      phone: string | null;
      photo_url: string | null;
      badge_number: string | null;
      role: RoleCode;
      unit_id: number | null;
      unit_name: string | null;
      permissions: string[];
      is_active: boolean;
    }>(
      `SELECT u.id, u.username, u.password_hash, u.full_name, u.phone, u.photo_url,
              u.badge_number, r.code AS role, u.unit_id, un.name AS unit_name,
              r.permissions, u.is_active
         FROM users u
         JOIN roles r ON r.id = u.role_id
         LEFT JOIN units un ON un.id = u.unit_id
        WHERE lower(u.username) = lower($1)`,
      [username]
    );

    // Constant-ish response regardless of which half failed.
    const ok = row ? await bcrypt.compare(password, row.password_hash) : false;
    if (!row || !ok || !row.is_active) {
      return res.status(401).json({ error: 'Username atau password salah' });
    }

    const token = signToken({ sub: row.id, username: row.username, role: row.role });

    res.cookie(TOKEN_COOKIE, token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: isProd,
      maxAge: 12 * 60 * 60 * 1000,
    });

    if (isFieldRole(row.role)) {
      await queryOne(
        `UPDATE users SET status = 'online', last_seen_at = NOW() WHERE id = $1 RETURNING id`,
        [row.id]
      );
      emitToCommand('user_online', { userId: row.id, status: 'online', fullName: row.full_name });
      await logActivity({
        userId: row.id,
        type: 'user_online',
        message: `${row.full_name} terhubung ke sistem`,
        refType: 'user',
        refId: row.id,
      });
    }

    await logSystem({
      userId: row.id,
      action: 'login',
      entity: 'user',
      entityId: row.id,
      ip: req.ip,
      userAgent: req.headers['user-agent'] ?? null,
    });

    res.json({
      token,
      expiresIn: env.jwtExpiresIn,
      user: {
        id: row.id,
        username: row.username,
        fullName: row.full_name,
        phone: row.phone,
        photoUrl: row.photo_url,
        badgeNumber: row.badge_number,
        role: row.role,
        unitId: row.unit_id,
        unitName: row.unit_name,
        permissions: row.permissions ?? [],
      },
    });
  })
);

router.post(
  '/logout',
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = req.user!;

    if (isFieldRole(user.role)) {
      await queryOne(`UPDATE users SET status = 'offline' WHERE id = $1 RETURNING id`, [user.id]);
      emitToCommand('user_offline', { userId: user.id, status: 'offline', fullName: user.fullName });
    }

    await logSystem({
      userId: user.id,
      action: 'logout',
      entity: 'user',
      entityId: user.id,
      ip: req.ip,
    });

    res.clearCookie(TOKEN_COOKIE);
    res.json({ ok: true });
  })
);

router.get(
  '/me',
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = req.user!;
    const row = await queryOne<{
      phone: string | null;
      photo_url: string | null;
      badge_number: string | null;
      status: string;
      battery: number | null;
    }>(
      `SELECT phone, photo_url, badge_number, status, battery FROM users WHERE id = $1`,
      [user.id]
    );

    res.json({
      user: {
        ...user,
        phone: row?.phone ?? null,
        photoUrl: row?.photo_url ?? null,
        badgeNumber: row?.badge_number ?? null,
        status: row?.status ?? 'offline',
        battery: row?.battery ?? null,
      },
    });
  })
);

export default router;
