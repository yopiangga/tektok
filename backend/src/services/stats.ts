import { queryOne } from '../db/pool';
import { emitToCommand } from '../realtime/io';

export interface DashboardStats {
  personnelActive: number;
  personnelTotal: number;
  onlinePercent: number;
  streamingNow: number;
  openIncidents: number;
  reportsToday: number;
  pendingMissions: number;
}

export async function getStats(): Promise<DashboardStats> {
  const row = await queryOne<Record<string, string>>(`
    SELECT
      (SELECT COUNT(*) FROM users u JOIN roles r ON r.id = u.role_id
        WHERE r.code = 'personnel' AND u.is_active AND u.status <> 'offline')      AS personnel_active,
      (SELECT COUNT(*) FROM users u JOIN roles r ON r.id = u.role_id
        WHERE r.code = 'personnel' AND u.is_active)                                AS personnel_total,
      (SELECT COUNT(*) FROM streams WHERE status = 'live')                         AS streaming_now,
      (SELECT COUNT(*) FROM incidents WHERE status <> 'closed')                    AS open_incidents,
      (SELECT COUNT(*) FROM reports WHERE created_at >= date_trunc('day', NOW()))  AS reports_today,
      (SELECT COUNT(*) FROM missions WHERE status = 'pending')                     AS pending_missions
  `);

  const n = (key: string) => Number(row?.[key] ?? 0);
  const active = n('personnel_active');
  const total = n('personnel_total');

  return {
    personnelActive: active,
    personnelTotal: total,
    onlinePercent: total === 0 ? 0 : Math.round((active / total) * 100),
    streamingNow: n('streaming_now'),
    openIncidents: n('open_incidents'),
    reportsToday: n('reports_today'),
    pendingMissions: n('pending_missions'),
  };
}

/** Recomputes and pushes statistics to every dashboard. */
export async function broadcastStats(): Promise<void> {
  emitToCommand('stats_updated', await getStats());
}
