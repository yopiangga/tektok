import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { queryOne } from '../db/pool';
import type { AuthUser, RoleCode } from '../types';

export const TOKEN_COOKIE = 'tocs_token';

export interface TokenPayload {
  sub: number;
  username: string;
  role: RoleCode;
}

export function signToken(payload: TokenPayload): string {
  return jwt.sign(payload, env.jwtSecret, { expiresIn: env.jwtExpiresIn } as jwt.SignOptions);
}

export function verifyToken(token: string): TokenPayload {
  return jwt.verify(token, env.jwtSecret) as unknown as TokenPayload;
}

function extractToken(req: Request): string | null {
  const header = req.headers.authorization;
  if (header?.startsWith('Bearer ')) return header.slice(7);
  const cookie = (req as Request & { cookies?: Record<string, string> }).cookies?.[TOKEN_COOKIE];
  return cookie ?? null;
}

export async function loadUser(id: number): Promise<AuthUser | null> {
  const row = await queryOne<{
    id: number;
    username: string;
    full_name: string;
    role: RoleCode;
    unit_id: number | null;
    unit_name: string | null;
    permissions: string[];
    is_active: boolean;
  }>(
    `SELECT u.id, u.username, u.full_name, r.code AS role, u.unit_id,
            un.name AS unit_name, r.permissions, u.is_active
       FROM users u
       JOIN roles r ON r.id = u.role_id
       LEFT JOIN units un ON un.id = u.unit_id
      WHERE u.id = $1`,
    [id]
  );

  if (!row || !row.is_active) return null;

  return {
    id: row.id,
    username: row.username,
    fullName: row.full_name,
    role: row.role,
    unitId: row.unit_id,
    unitName: row.unit_name,
    permissions: row.permissions ?? [],
  };
}

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const token = extractToken(req);
  if (!token) return res.status(401).json({ error: 'Authentication required' });

  try {
    const payload = verifyToken(token);
    const user = await loadUser(payload.sub);
    if (!user) return res.status(401).json({ error: 'Account is no longer active' });
    req.user = user;
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired session' });
  }
}

export function requireRole(...roles: RoleCode[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) return res.status(401).json({ error: 'Authentication required' });
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Insufficient permissions for this action' });
    }
    next();
  };
}

/** Anyone allowed into the command centre dashboard. */
export const requireCommand = requireRole('superuser');

/** Field roles: personnel on foot plus drone and screen-share stations. */
export const requireField = requireRole('personnel', 'drone', 'screen');
