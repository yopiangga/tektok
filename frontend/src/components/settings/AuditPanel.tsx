import { useQuery } from '@tanstack/react-query';
import { ClipboardList, RefreshCw } from 'lucide-react';
import { api } from '../../lib/api';
import { cx, formatDateTime, timeAgo } from '../../lib/format';
import { EmptyState, PanelLoading, Spinner } from '../ui/Primitives';

interface AuditLog {
  id: number;
  action: string;
  entity: string | null;
  entityId: number | null;
  ip: string | null;
  userName: string | null;
  createdAt: string;
}

/** Colour by action family so destructive events stand out when scanning. */
function actionTone(action: string): string {
  if (action.startsWith('user.') || action.includes('delete')) return 'bg-warning-soft text-warning-strong';
  if (action === 'login') return 'bg-success-soft text-success-strong';
  if (action === 'logout') return 'bg-canvas-sunken text-ink-muted';
  return 'bg-accent-soft text-accent-strong';
}

export default function AuditPanel() {
  const logs = useQuery({
    queryKey: ['settings-audit'],
    queryFn: async () => {
      const { data } = await api.get<{ logs: AuditLog[] }>('/settings/audit', {
        params: { limit: 100 },
      });
      return data.logs;
    },
  });

  return (
    <section className="card overflow-hidden">
      <header className="card-header">
        <h2 className="card-title">
          <ClipboardList size={16} className="text-accent" />
          Audit Log
          <span className="ml-1 rounded-full bg-canvas-sunken px-2 py-0.5 text-[11px] font-medium text-ink-muted">
            {logs.data?.length ?? 0} terbaru
          </span>
        </h2>
        <button
          type="button"
          className="btn-secondary btn-sm"
          onClick={() => logs.refetch()}
          disabled={logs.isFetching}
        >
          {logs.isFetching ? <Spinner size={14} /> : <RefreshCw size={14} />}
          Muat ulang
        </button>
      </header>

      <div className="max-h-[32rem] overflow-y-auto">
        {logs.isLoading ? (
          <PanelLoading />
        ) : (logs.data?.length ?? 0) === 0 ? (
          <EmptyState
            icon={<ClipboardList size={22} />}
            title="Belum ada catatan audit"
            hint="Aktivitas istimewa seperti login dan perubahan pengguna tercatat di sini."
          />
        ) : (
          <table className="w-full border-collapse">
            <thead className="table-head">
              <tr>
                <th>Aksi</th>
                <th>Pengguna</th>
                <th className="hidden sm:table-cell">Objek</th>
                <th className="hidden lg:table-cell">IP</th>
                <th className="text-right">Waktu</th>
              </tr>
            </thead>
            <tbody>
              {logs.data!.map((log) => (
                <tr key={log.id} className="border-t border-line">
                  <td className="px-3 py-2">
                    <span className={cx('chip font-mono', actionTone(log.action))}>
                      {log.action}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-sm text-ink">{log.userName ?? '—'}</td>
                  <td className="hidden px-3 py-2 text-sm text-ink-muted sm:table-cell">
                    {log.entity ? `${log.entity}#${log.entityId ?? '—'}` : '—'}
                  </td>
                  <td className="hidden px-3 py-2 font-mono text-xs text-ink-muted lg:table-cell">
                    {log.ip ?? '—'}
                  </td>
                  <td
                    className="px-3 py-2 text-right text-xs text-ink-muted"
                    title={formatDateTime(log.createdAt)}
                  >
                    {timeAgo(log.createdAt)} lalu
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}
