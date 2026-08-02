import { useSocketStatus } from '../../hooks/useSocketEvent';
import { cx } from '../../lib/format';
import type { DashboardStats, Operation, Unit } from '../../lib/types';

export default function DashboardFooter({
  operation,
  units,
  stats,
}: {
  operation?: Operation | null;
  units: Unit[];
  stats?: DashboardStats;
}) {
  const socketStatus = useSocketStatus();

  return (
    <footer className="mt-4 border-t border-line bg-canvas-raised px-4 py-3 lg:px-6">
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 text-xs text-ink-muted">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <span className="font-semibold text-ink-soft">TOCS v1.0</span>
          <span className="hidden sm:inline">·</span>
          <span>{operation?.name ?? 'Tidak ada operasi aktif'}</span>
          {operation && (
            <>
              <span className="hidden sm:inline">·</span>
              <span className="font-mono">{operation.code}</span>
            </>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          {units.slice(0, 6).map((unit) => (
            <span key={unit.id} className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: unit.color }} />
              {unit.code}
              <span className="tabular-nums text-ink-faint">
                {unit.online}/{unit.total}
              </span>
            </span>
          ))}
        </div>

        <div className="flex items-center gap-4">
          {stats && (
            <span className="tabular-nums">
              Kesiapan <span className="font-semibold text-ink-soft">{stats.onlinePercent}%</span>
            </span>
          )}
          <span className="flex items-center gap-1.5">
            <span
              className={cx(
                'h-2 w-2 rounded-full',
                socketStatus === 'connected' ? 'animate-pulse bg-success' : 'bg-danger'
              )}
            />
            {socketStatus === 'connected' ? 'Realtime aktif' : 'Realtime terputus'}
          </span>
        </div>
      </div>
    </footer>
  );
}
