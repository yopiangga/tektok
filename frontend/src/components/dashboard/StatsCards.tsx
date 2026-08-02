import {
  AlertTriangle,
  FileText,
  Percent,
  Target,
  Users,
  Video,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { cx } from '../../lib/format';
import type { DashboardStats } from '../../lib/types';

interface Tile {
  key: string;
  label: string;
  value: string;
  sub?: string;
  icon: LucideIcon;
  tone: 'accent' | 'success' | 'warning' | 'danger' | 'neutral';
  progress?: number;
}

const TONE: Record<Tile['tone'], { bg: string; fg: string; bar: string }> = {
  accent: { bg: 'bg-accent-soft', fg: 'text-accent-strong', bar: 'bg-accent' },
  success: { bg: 'bg-success-soft', fg: 'text-success-strong', bar: 'bg-success' },
  warning: { bg: 'bg-warning-soft', fg: 'text-warning-strong', bar: 'bg-warning' },
  danger: { bg: 'bg-danger-soft', fg: 'text-danger-strong', bar: 'bg-danger' },
  neutral: { bg: 'bg-canvas-sunken', fg: 'text-ink-soft', bar: 'bg-ink-faint' },
};

export default function StatsCards({ stats }: { stats?: DashboardStats }) {
  const s: DashboardStats = stats ?? {
    personnelActive: 0,
    personnelTotal: 0,
    onlinePercent: 0,
    streamingNow: 0,
    openIncidents: 0,
    reportsToday: 0,
    pendingMissions: 0,
  };

  const tiles: Tile[] = [
    {
      key: 'personnel',
      label: 'Personel Aktif',
      value: `${s.personnelActive}`,
      sub: `dari ${s.personnelTotal} personel`,
      icon: Users,
      tone: 'success',
      progress: s.personnelTotal ? (s.personnelActive / s.personnelTotal) * 100 : 0,
    },
    {
      key: 'streaming',
      label: 'Siaran Langsung',
      value: `${s.streamingNow}`,
      sub: 'kanal aktif',
      icon: Video,
      tone: 'accent',
    },
    {
      key: 'incidents',
      label: 'Insiden Terbuka',
      value: `${s.openIncidents}`,
      sub: 'perlu penanganan',
      icon: AlertTriangle,
      tone: s.openIncidents > 0 ? 'danger' : 'neutral',
    },
    {
      key: 'reports',
      label: 'Laporan Hari Ini',
      value: `${s.reportsToday}`,
      sub: 'laporan masuk',
      icon: FileText,
      tone: 'warning',
    },
    {
      key: 'missions',
      label: 'Misi Menunggu',
      value: `${s.pendingMissions}`,
      sub: 'belum diterima',
      icon: Target,
      tone: s.pendingMissions > 0 ? 'warning' : 'neutral',
    },
    {
      key: 'online',
      label: 'Tingkat Online',
      value: `${s.onlinePercent}%`,
      sub: 'kesiapan unit',
      icon: Percent,
      tone: s.onlinePercent >= 80 ? 'success' : s.onlinePercent >= 50 ? 'warning' : 'danger',
      progress: s.onlinePercent,
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
      {tiles.map((tile) => {
        const tone = TONE[tile.tone];
        return (
          <article key={tile.key} className="card p-4">
            <div className="flex items-start justify-between gap-2">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-muted">
                {tile.label}
              </p>
              <span className={cx('grid h-8 w-8 shrink-0 place-items-center rounded-lg', tone.bg, tone.fg)}>
                <tile.icon size={16} />
              </span>
            </div>

            <p className="mt-3 text-3xl font-bold leading-none tabular-nums text-ink">
              {tile.value}
            </p>
            {tile.sub && <p className="mt-1.5 text-xs text-ink-muted">{tile.sub}</p>}

            {tile.progress !== undefined && (
              <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-canvas-sunken">
                <div
                  className={cx('h-full rounded-full transition-[width] duration-500', tone.bar)}
                  style={{ width: `${Math.min(100, Math.max(0, tile.progress))}%` }}
                />
              </div>
            )}
          </article>
        );
      })}
    </div>
  );
}
