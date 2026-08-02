import {
  Activity as ActivityIcon,
  AlertTriangle,
  FileText,
  LogIn,
  LogOut,
  MapPin,
  Target,
  Video,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { cx, formatTime, timeAgo } from '../../lib/format';
import type { Activity } from '../../lib/types';
import { EmptyState, PanelLoading } from '../ui/Primitives';

const TYPE_META: Record<string, { icon: LucideIcon; bg: string; fg: string }> = {
  report_created: { icon: FileText, bg: 'bg-warning-soft', fg: 'text-warning-strong' },
  mission_created: { icon: Target, bg: 'bg-accent-soft', fg: 'text-accent-strong' },
  mission_assigned: { icon: Target, bg: 'bg-accent-soft', fg: 'text-accent-strong' },
  mission_accepted: { icon: Target, bg: 'bg-accent-soft', fg: 'text-accent-strong' },
  mission_completed: { icon: Target, bg: 'bg-success-soft', fg: 'text-success-strong' },
  incident_created: { icon: AlertTriangle, bg: 'bg-danger-soft', fg: 'text-danger-strong' },
  incident_closed: { icon: AlertTriangle, bg: 'bg-success-soft', fg: 'text-success-strong' },
  stream_started: { icon: Video, bg: 'bg-danger-soft', fg: 'text-danger-strong' },
  stream_stopped: { icon: Video, bg: 'bg-canvas-sunken', fg: 'text-ink-muted' },
  location_updated: { icon: MapPin, bg: 'bg-canvas-sunken', fg: 'text-ink-muted' },
  user_online: { icon: LogIn, bg: 'bg-success-soft', fg: 'text-success-strong' },
  user_offline: { icon: LogOut, bg: 'bg-danger-soft', fg: 'text-danger-strong' },
};

const FALLBACK = { icon: ActivityIcon, bg: 'bg-canvas-sunken', fg: 'text-ink-muted' };

export default function TimelinePanel({
  activity,
  loading,
}: {
  activity: Activity[];
  loading: boolean;
}) {
  return (
    <section className="card flex h-full min-h-[360px] flex-col overflow-hidden">
      <header className="card-header">
        <h2 className="card-title">
          <ActivityIcon size={16} className="text-accent" />
          Linimasa Aktivitas
        </h2>
        <span className="flex items-center gap-1.5 text-[11px] font-medium text-ink-muted">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-success" />
          Realtime
        </span>
      </header>

      <div className="panel-scroll min-h-0 flex-1 px-4 py-3">
        {loading && activity.length === 0 ? (
          <PanelLoading />
        ) : activity.length === 0 ? (
          <EmptyState title="Belum ada aktivitas" hint="Kejadian lapangan akan muncul di sini." />
        ) : (
          <ol className="relative space-y-3.5 border-l border-line pl-6">
            {activity.map((item) => {
              const meta = TYPE_META[item.type] ?? FALLBACK;
              return (
                <li key={item.id} className="relative animate-slide-up">
                  <span
                    className={cx(
                      'absolute -left-[31px] grid h-6 w-6 place-items-center rounded-full ring-4 ring-canvas-raised',
                      meta.bg,
                      meta.fg
                    )}
                  >
                    <meta.icon size={12} />
                  </span>

                  <div className="flex items-baseline justify-between gap-3">
                    <p className="min-w-0 text-sm leading-snug text-ink-soft">{item.message}</p>
                    <time
                      className="shrink-0 font-mono text-[11px] tabular-nums text-ink-faint"
                      dateTime={item.createdAt}
                      title={new Date(item.createdAt).toLocaleString('id-ID')}
                    >
                      {formatTime(item.createdAt)}
                    </time>
                  </div>
                  <p className="mt-0.5 text-[11px] text-ink-faint">{timeAgo(item.createdAt)} lalu</p>
                </li>
              );
            })}
          </ol>
        )}
      </div>
    </section>
  );
}
