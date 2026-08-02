import { Battery, Search, SlidersHorizontal, Users, Video } from 'lucide-react';
import { useMemo, useState } from 'react';
import {
  PRIORITY_CHIP,
  STATUS_CHIP,
  STATUS_COLOR,
  STATUS_LABEL,
  batteryTone,
  cx,
  signalBars,
  timeAgo,
} from '../../lib/format';
import type { Personnel, PresenceStatus, Unit } from '../../lib/types';
import { Avatar, EmptyState, PanelLoading, StatusDot } from '../ui/Primitives';

function SignalMeter({ level }: { level: number | null }) {
  const bars = signalBars(level);
  return (
    <span className="inline-flex items-end gap-[2px]" title={`Sinyal ${level ?? 0}%`}>
      {[1, 2, 3, 4].map((bar) => (
        <span
          key={bar}
          className={cx(
            'w-[3px] rounded-sm',
            bar <= bars ? 'bg-ink-soft' : 'bg-line-strong',
            bar === 1 && 'h-1.5',
            bar === 2 && 'h-2',
            bar === 3 && 'h-2.5',
            bar === 4 && 'h-3'
          )}
        />
      ))}
    </span>
  );
}

export default function PersonnelPanel({
  personnel,
  units,
  loading,
  onSelect,
}: {
  personnel: Personnel[];
  units: Unit[];
  loading: boolean;
  onSelect: (id: number) => void;
}) {
  const [term, setTerm] = useState('');
  const [status, setStatus] = useState<PresenceStatus | 'all'>('all');
  const [unitId, setUnitId] = useState<'all' | number>('all');
  const [streamingOnly, setStreamingOnly] = useState(false);
  const [showFilters, setShowFilters] = useState(false);

  const rows = useMemo(() => {
    const q = term.trim().toLowerCase();
    return personnel.filter(
      (p) =>
        (status === 'all' || p.status === status) &&
        (unitId === 'all' || p.unit?.id === unitId) &&
        (!streamingOnly || Boolean(p.stream)) &&
        (!q ||
          p.fullName.toLowerCase().includes(q) ||
          (p.badgeNumber ?? '').toLowerCase().includes(q) ||
          (p.unit?.name ?? '').toLowerCase().includes(q))
    );
  }, [personnel, term, status, unitId, streamingOnly]);

  const activeFilters =
    (status !== 'all' ? 1 : 0) + (unitId !== 'all' ? 1 : 0) + (streamingOnly ? 1 : 0);

  return (
    <section className="card flex h-full min-h-[420px] flex-col overflow-hidden">
      <header className="card-header">
        <h2 className="card-title">
          <Users size={16} className="text-accent" />
          Personel
          <span className="ml-1 rounded-full bg-canvas-sunken px-2 py-0.5 text-[11px] font-medium text-ink-muted">
            {rows.length}
          </span>
        </h2>
        <button
          type="button"
          onClick={() => setShowFilters((v) => !v)}
          className={cx('btn-secondary btn-sm', activeFilters > 0 && 'border-accent text-accent')}
        >
          <SlidersHorizontal size={14} />
          Filter
          {activeFilters > 0 && (
            <span className="rounded-full bg-accent px-1.5 text-[10px] font-bold text-white">
              {activeFilters}
            </span>
          )}
        </button>
      </header>

      <div className="border-b border-line px-3 py-2.5">
        <div className="relative">
          <Search
            size={15}
            className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-faint"
          />
          <input
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            placeholder="Cari nama, nomor, atau unit…"
            className="field h-9 pl-8 text-sm"
            aria-label="Cari personel"
          />
        </div>

        {showFilters && (
          <div className="mt-2.5 grid grid-cols-2 gap-2 animate-slide-up">
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as PresenceStatus | 'all')}
              className="field h-8 py-0 text-xs"
              aria-label="Filter status"
            >
              <option value="all">Semua status</option>
              <option value="online">Online</option>
              <option value="idle">Idle</option>
              <option value="offline">Offline</option>
            </select>

            <select
              value={String(unitId)}
              onChange={(e) => setUnitId(e.target.value === 'all' ? 'all' : Number(e.target.value))}
              className="field h-8 py-0 text-xs"
              aria-label="Filter unit"
            >
              <option value="all">Semua unit</option>
              {units.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>

            <label className="col-span-2 flex cursor-pointer items-center gap-2 text-xs text-ink-soft">
              <input
                type="checkbox"
                checked={streamingOnly}
                onChange={(e) => setStreamingOnly(e.target.checked)}
                className="h-4 w-4 rounded border-line-strong text-accent focus:ring-accent/30"
              />
              Hanya yang sedang siaran
            </label>
          </div>
        )}
      </div>

      <div className="panel-scroll min-h-0 flex-1">
        {loading && personnel.length === 0 ? (
          <PanelLoading />
        ) : rows.length === 0 ? (
          // A fresh install has no personnel at all; telling the operator to
          // adjust filters they never set would send them looking for a bug.
          personnel.length === 0 ? (
            <EmptyState
              title="Belum ada personel terdaftar"
              hint="Tambahkan akun personel melalui Pengaturan Sistem → Pengguna."
            />
          ) : (
            <EmptyState
              title="Tidak ada personel cocok"
              hint="Sesuaikan filter atau kata kunci pencarian."
            />
          )
        ) : (
          <table className="w-full border-collapse">
            <thead className="table-head">
              <tr>
                <th>Status</th>
                <th>Nama</th>
                <th className="hidden xl:table-cell">Unit</th>
                <th>Baterai</th>
                <th className="hidden lg:table-cell">Sinyal</th>
                <th className="hidden 2xl:table-cell">Misi</th>
                <th>Live</th>
                <th className="text-right">Update</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => (
                <tr
                  key={p.id}
                  className="table-row"
                  onClick={() => onSelect(p.id)}
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      onSelect(p.id);
                    }
                  }}
                >
                  <td>
                    <span className={cx('chip', STATUS_CHIP[p.status])}>
                      <StatusDot color={STATUS_COLOR[p.status]} pulse={p.status === 'online'} />
                      <span className="hidden sm:inline">{STATUS_LABEL[p.status]}</span>
                    </span>
                  </td>

                  <td>
                    <div className="flex items-center gap-2.5">
                      <Avatar
                        name={p.fullName}
                        src={p.photoUrl}
                        size={30}
                        color={p.unit?.color ?? '#2563EB'}
                      />
                      <div className="min-w-0">
                        <p className="truncate font-medium text-ink">{p.fullName}</p>
                        <p className="truncate text-xs text-ink-muted">{p.badgeNumber ?? '—'}</p>
                      </div>
                    </div>
                  </td>

                  <td className="hidden xl:table-cell">
                    {p.unit ? (
                      <span
                        className="chip"
                        style={{ backgroundColor: `${p.unit.color}18`, color: p.unit.color }}
                      >
                        {p.unit.code}
                      </span>
                    ) : (
                      <span className="text-ink-faint">—</span>
                    )}
                  </td>

                  <td>
                    <span className={cx('flex items-center gap-1.5 font-medium', batteryTone(p.battery))}>
                      <Battery size={15} />
                      <span className="tabular-nums">{p.battery ?? '—'}%</span>
                    </span>
                  </td>

                  <td className="hidden lg:table-cell">
                    <SignalMeter level={p.signal} />
                  </td>

                  <td className="hidden 2xl:table-cell">
                    {p.mission ? (
                      <span className={cx('chip max-w-[10rem] truncate', PRIORITY_CHIP[p.mission.priority])}>
                        {p.mission.title}
                      </span>
                    ) : (
                      <span className="text-ink-faint">—</span>
                    )}
                  </td>

                  <td>
                    {p.stream ? (
                      <span className="chip bg-danger-soft text-danger-strong">
                        <Video size={12} /> LIVE
                      </span>
                    ) : (
                      <span className="text-ink-faint">—</span>
                    )}
                  </td>

                  <td className="text-right text-xs tabular-nums text-ink-muted">
                    {timeAgo(p.lastSeenAt)}
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
