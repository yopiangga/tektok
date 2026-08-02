import { env } from '../config/env';
import { query } from '../db/pool';
import { emitToCommand } from '../realtime/io';
import { logActivity } from './activity';
import { notify } from './notify';
import { broadcastStats } from './stats';

// Personnel already warned about low battery — prevents notification spam on
// every sweep while the device sits below the threshold.
const lowBatteryWarned = new Set<number>();

/**
 * Derives presence from GPS freshness rather than socket state: a phone that
 * stops reporting is operationally offline even if the browser tab is open.
 */
export async function sweepPresence(): Promise<void> {
  const changed = await query<{
    id: number;
    full_name: string;
    status: string;
    previous_status: string;
  }>(
    `WITH target AS (
       SELECT u.id,
              u.full_name,
              u.status AS previous_status,
              CASE
                WHEN u.last_seen_at IS NULL
                  OR u.last_seen_at < NOW() - ($1 || ' seconds')::interval THEN 'offline'
                WHEN u.last_seen_at < NOW() - ($2 || ' seconds')::interval THEN 'idle'
                ELSE 'online'
              END AS next_status
         FROM users u
         JOIN roles r ON r.id = u.role_id
        WHERE r.code = 'personnel' AND u.is_active
     )
     UPDATE users u
        SET status = t.next_status, updated_at = NOW()
       FROM target t
      WHERE u.id = t.id AND u.status <> t.next_status
      RETURNING u.id, t.full_name, u.status, t.previous_status`,
    [env.offlineAfterSeconds, env.idleAfterSeconds]
  );

  for (const row of changed) {
    emitToCommand(row.status === 'offline' ? 'user_offline' : 'user_online', {
      userId: row.id,
      status: row.status,
      fullName: row.full_name,
    });

    if (row.status === 'offline') {
      await notify({
        type: 'personnel_offline',
        title: 'Personel Offline',
        body: `${row.full_name} tidak mengirim posisi lebih dari ${Math.round(env.offlineAfterSeconds / 60)} menit.`,
        severity: 'danger',
        refType: 'user',
        refId: row.id,
      });
      await logActivity({
        userId: row.id,
        type: 'user_offline',
        message: `${row.full_name} terputus dari sistem`,
        refType: 'user',
        refId: row.id,
      });
    }
  }

  // Low battery watch
  const lowBattery = await query<{ id: number; full_name: string; battery: number }>(
    `SELECT u.id, u.full_name, u.battery
       FROM users u JOIN roles r ON r.id = u.role_id
      WHERE r.code = 'personnel' AND u.is_active
        AND u.status <> 'offline'
        AND u.battery IS NOT NULL AND u.battery <= $1`,
    [env.lowBatteryThreshold]
  );

  const lowIds = new Set(lowBattery.map((r) => r.id));
  for (const id of lowBatteryWarned) if (!lowIds.has(id)) lowBatteryWarned.delete(id);

  for (const row of lowBattery) {
    if (lowBatteryWarned.has(row.id)) continue;
    lowBatteryWarned.add(row.id);
    await notify({
      type: 'battery_low',
      title: 'Baterai Lemah',
      body: `${row.full_name} — baterai tersisa ${row.battery}%.`,
      severity: 'warning',
      refType: 'user',
      refId: row.id,
    });
  }

  if (changed.length > 0) await broadcastStats();
}

let timer: NodeJS.Timeout | null = null;

export function startPresenceSweep(intervalMs = 15_000) {
  if (timer) return;
  timer = setInterval(() => {
    sweepPresence().catch((err) => console.error('[presence] sweep failed', err));
  }, intervalMs);
  console.log(`[presence] sweep running every ${intervalMs / 1000}s`);
}

export function stopPresenceSweep() {
  if (timer) clearInterval(timer);
  timer = null;
}
