import { queryOne } from '../db/pool';
import { emitToCommand, emitToUser } from '../realtime/io';

export type Severity = 'info' | 'success' | 'warning' | 'danger';

export interface NotificationInput {
  /** Omit userId to broadcast into the command centre notification panel. */
  userId?: number | null;
  type: string;
  title: string;
  body?: string;
  severity?: Severity;
  refType?: string | null;
  refId?: number | null;
}

export async function notify(input: NotificationInput) {
  const audience = input.userId ? 'user' : 'command';

  const row = await queryOne<{
    id: number;
    user_id: number | null;
    type: string;
    title: string;
    body: string | null;
    severity: Severity;
    ref_type: string | null;
    ref_id: number | null;
    created_at: string;
  }>(
    `INSERT INTO notifications (user_id, audience, type, title, body, severity, ref_type, ref_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
     RETURNING id, user_id, type, title, body, severity, ref_type, ref_id, created_at`,
    [
      input.userId ?? null,
      audience,
      input.type,
      input.title,
      input.body ?? null,
      input.severity ?? 'info',
      input.refType ?? null,
      input.refId ?? null,
    ]
  );

  if (!row) return null;

  const payload = {
    id: row.id,
    type: row.type,
    title: row.title,
    body: row.body,
    severity: row.severity,
    refType: row.ref_type,
    refId: row.ref_id,
    createdAt: row.created_at,
    read: false,
  };

  if (input.userId) emitToUser(input.userId, 'notification', payload);
  else emitToCommand('notification', payload);

  return payload;
}
