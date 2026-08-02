import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  BatteryLow,
  Bell,
  CheckCheck,
  CheckCircle2,
  FileText,
  UserX,
  Video,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { api } from '../../lib/api';
import { cx, timeAgo } from '../../lib/format';
import type { AppNotification } from '../../lib/types';
import { EmptyState, PanelLoading } from '../ui/Primitives';

const TYPE_ICON: Record<string, LucideIcon> = {
  battery_low: BatteryLow,
  personnel_offline: UserX,
  mission_completed: CheckCircle2,
  mission_assigned: CheckCircle2,
  stream_started: Video,
  new_report: FileText,
  report_verified: FileText,
  incident_created: AlertTriangle,
  incident_assigned: AlertTriangle,
};

const SEVERITY: Record<AppNotification['severity'], { bg: string; fg: string; ring: string }> = {
  info: { bg: 'bg-accent-soft', fg: 'text-accent-strong', ring: 'ring-accent/20' },
  success: { bg: 'bg-success-soft', fg: 'text-success-strong', ring: 'ring-success/20' },
  warning: { bg: 'bg-warning-soft', fg: 'text-warning-strong', ring: 'ring-warning/20' },
  danger: { bg: 'bg-danger-soft', fg: 'text-danger-strong', ring: 'ring-danger/20' },
};

export default function NotificationPanel({
  notifications,
  loading,
}: {
  notifications: AppNotification[];
  loading: boolean;
}) {
  const queryClient = useQueryClient();
  const unread = notifications.filter((n) => !n.read).length;

  const markAll = useMutation({
    mutationFn: () => api.post('/notifications/read-all'),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notifications'] }),
  });

  const markOne = useMutation({
    mutationFn: (id: number) => api.post(`/notifications/${id}/read`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notifications'] }),
  });

  return (
    <section className="card flex h-full min-h-[360px] flex-col overflow-hidden">
      <header className="card-header">
        <h2 className="card-title">
          <Bell size={16} className="text-warning" />
          Notifikasi
          {unread > 0 && (
            <span className="ml-1 rounded-full bg-danger px-2 py-0.5 text-[11px] font-bold text-white">
              {unread}
            </span>
          )}
        </h2>
        <button
          type="button"
          className="btn-secondary btn-sm"
          onClick={() => markAll.mutate()}
          disabled={unread === 0 || markAll.isPending}
        >
          <CheckCheck size={14} />
          Tandai dibaca
        </button>
      </header>

      <div className="panel-scroll min-h-0 flex-1">
        {loading && notifications.length === 0 ? (
          <PanelLoading />
        ) : notifications.length === 0 ? (
          <EmptyState
            icon={<Bell size={22} />}
            title="Tidak ada notifikasi"
            hint="Peringatan sistem akan muncul di sini secara realtime."
          />
        ) : (
          <ul className="divide-y divide-line">
            {notifications.map((notification) => {
              const Icon = TYPE_ICON[notification.type] ?? Bell;
              const tone = SEVERITY[notification.severity];
              return (
                <li key={notification.id}>
                  <button
                    type="button"
                    onClick={() => !notification.read && markOne.mutate(notification.id)}
                    className={cx(
                      'flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-canvas',
                      !notification.read && 'bg-accent-soft/40'
                    )}
                  >
                    <span
                      className={cx(
                        'mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg ring-1',
                        tone.bg,
                        tone.fg,
                        tone.ring
                      )}
                    >
                      <Icon size={15} />
                    </span>

                    <span className="min-w-0 flex-1">
                      <span className="flex items-baseline justify-between gap-2">
                        <span className="truncate text-sm font-semibold text-ink">
                          {notification.title}
                        </span>
                        <span className="shrink-0 text-[11px] tabular-nums text-ink-faint">
                          {timeAgo(notification.createdAt)}
                        </span>
                      </span>
                      {notification.body && (
                        <span className="mt-0.5 block line-clamp-2 text-xs leading-snug text-ink-muted">
                          {notification.body}
                        </span>
                      )}
                    </span>

                    {!notification.read && (
                      <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-accent" />
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}
