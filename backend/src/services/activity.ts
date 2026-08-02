import { queryOne } from '../db/pool';
import { emitToCommand } from '../realtime/io';

export interface ActivityInput {
  userId?: number | null;
  type: string;
  message: string;
  refType?: string | null;
  refId?: number | null;
  meta?: Record<string, unknown>;
}

/** Writes a timeline entry and pushes it to every dashboard in realtime. */
export async function logActivity(input: ActivityInput) {
  const row = await queryOne<{
    id: number;
    user_id: number | null;
    type: string;
    message: string;
    created_at: string;
  }>(
    `INSERT INTO activity_logs (user_id, type, message, ref_type, ref_id, meta)
     VALUES ($1,$2,$3,$4,$5,$6)
     RETURNING id, user_id, type, message, created_at`,
    [
      input.userId ?? null,
      input.type,
      input.message,
      input.refType ?? null,
      input.refId ?? null,
      JSON.stringify(input.meta ?? {}),
    ]
  );

  if (row) {
    emitToCommand('activity', {
      id: row.id,
      userId: row.user_id,
      type: row.type,
      message: row.message,
      createdAt: row.created_at,
    });
  }

  return row;
}

/** Append-only audit trail — never emitted to clients. */
export async function logSystem(entry: {
  userId?: number | null;
  action: string;
  entity?: string | null;
  entityId?: number | null;
  ip?: string | null;
  userAgent?: string | null;
  meta?: Record<string, unknown>;
}) {
  await queryOne(
    `INSERT INTO system_logs (user_id, action, entity, entity_id, ip, user_agent, meta)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
    [
      entry.userId ?? null,
      entry.action,
      entry.entity ?? null,
      entry.entityId ?? null,
      entry.ip ?? null,
      entry.userAgent ?? null,
      JSON.stringify(entry.meta ?? {}),
    ]
  );
}
