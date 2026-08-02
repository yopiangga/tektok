import { useQuery } from '@tanstack/react-query';
import {
  Battery,
  Crosshair,
  MapPin,
  MessageSquare,
  Phone,
  Signal,
  Target,
  Video,
} from 'lucide-react';
import { api } from '../../lib/api';
import {
  REPORT_STATUS_CHIP,
  REPORT_STATUS_LABEL,
  REPORT_TYPE_LABEL,
  STATUS_CHIP,
  STATUS_COLOR,
  STATUS_LABEL,
  batteryTone,
  cx,
  formatDateTime,
  timeAgo,
} from '../../lib/format';
import type { Personnel, Report } from '../../lib/types';
import { Avatar, Modal, PanelLoading, StatusDot } from '../ui/Primitives';

interface DetailResponse {
  personnel: Personnel;
  recentReports: Array<Pick<Report, 'id' | 'status' | 'description' | 'createdAt'> & { type: string }>;
  track: Array<{ lat: number; lng: number; recordedAt: string }>;
}

export default function PersonnelDetail({
  personnelId,
  onClose,
  onWatchStream,
  onAssignMission,
  onOpenChat,
}: {
  personnelId: number | null;
  onClose: () => void;
  onWatchStream: (streamId: number) => void;
  onAssignMission: (personnelId: number) => void;
  onOpenChat: (personnelId: number) => void;
}) {
  const { data, isLoading } = useQuery({
    queryKey: ['personnel', personnelId],
    enabled: personnelId != null,
    queryFn: async () => {
      const { data } = await api.get<DetailResponse>(`/personnel/${personnelId}`);
      return data;
    },
  });

  const p = data?.personnel;

  return (
    <Modal
      open={personnelId != null}
      onClose={onClose}
      title={p?.fullName ?? 'Detail Personel'}
      subtitle={p ? `${p.badgeNumber ?? '—'} · ${p.unit?.name ?? 'Tanpa unit'}` : undefined}
      width="max-w-2xl"
    >
      {isLoading || !p ? (
        <PanelLoading />
      ) : (
        <div className="space-y-5">
          {/* Identity */}
          <div className="flex items-start gap-4">
            <Avatar
              name={p.fullName}
              src={p.photoUrl}
              size={64}
              color={p.unit?.color ?? '#2563EB'}
            />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className={cx('chip', STATUS_CHIP[p.status])}>
                  <StatusDot color={STATUS_COLOR[p.status]} pulse={p.status === 'online'} />
                  {STATUS_LABEL[p.status]}
                </span>
                {p.stream && (
                  <span className="chip bg-danger-soft text-danger-strong">
                    <Video size={12} /> Sedang siaran
                  </span>
                )}
                {p.unit && (
                  <span
                    className="chip"
                    style={{ backgroundColor: `${p.unit.color}18`, color: p.unit.color }}
                  >
                    {p.unit.name}
                  </span>
                )}
              </div>

              <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                <div className="flex items-center gap-2 text-ink-muted">
                  <Phone size={14} />
                  <span className="text-ink">{p.phone ?? '—'}</span>
                </div>
                <div className="flex items-center gap-2 text-ink-muted">
                  <Battery size={14} />
                  <span className={cx('font-medium', batteryTone(p.battery))}>
                    {p.battery ?? '—'}%
                  </span>
                </div>
                <div className="flex items-center gap-2 text-ink-muted">
                  <Signal size={14} />
                  <span className="text-ink">{p.signal ?? '—'}%</span>
                </div>
                <div className="flex items-center gap-2 text-ink-muted">
                  <MapPin size={14} />
                  <span className="font-mono text-xs text-ink">
                    {p.lat != null && p.lng != null
                      ? `${p.lat.toFixed(5)}, ${p.lng.toFixed(5)}`
                      : 'Tidak tersedia'}
                  </span>
                </div>
              </dl>

              <p className="mt-2 text-xs text-ink-muted">
                Pembaruan terakhir {timeAgo(p.lastSeenAt)} lalu · {formatDateTime(p.lastSeenAt)}
              </p>
            </div>
          </div>

          {/* Current mission */}
          <div className="rounded-xl border border-line bg-canvas p-3.5">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">
              Misi Berjalan
            </p>
            {p.mission ? (
              <div className="flex items-start gap-2.5">
                <Target size={16} className="mt-0.5 shrink-0 text-accent" />
                <div>
                  <p className="text-sm font-medium text-ink">{p.mission.title}</p>
                  <p className="mt-0.5 text-xs text-ink-muted">
                    Status {p.mission.status} · prioritas {p.mission.priority}
                  </p>
                </div>
              </div>
            ) : (
              <p className="text-sm text-ink-muted">Tidak ada misi aktif.</p>
            )}
          </div>

          {/* Recent reports */}
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">
              Laporan Terakhir
            </p>
            {data.recentReports.length === 0 ? (
              <p className="rounded-xl border border-line bg-canvas p-3.5 text-sm text-ink-muted">
                Belum ada laporan dari personel ini.
              </p>
            ) : (
              <ul className="space-y-2">
                {data.recentReports.map((report) => (
                  <li key={report.id} className="rounded-xl border border-line bg-canvas p-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-semibold text-ink-soft">
                        {REPORT_TYPE_LABEL[report.type] ?? report.type}
                      </span>
                      <span className={cx('chip', REPORT_STATUS_CHIP[report.status])}>
                        {REPORT_STATUS_LABEL[report.status]}
                      </span>
                    </div>
                    <p className="mt-1.5 line-clamp-2 text-sm text-ink-soft">{report.description}</p>
                    <p className="mt-1 text-[11px] text-ink-faint">
                      {formatDateTime(report.createdAt)}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Actions — the blueprint's four buttons */}
          <div className="grid grid-cols-2 gap-2 border-t border-line pt-4 sm:grid-cols-4">
            <button
              type="button"
              className="btn-primary btn-md"
              disabled={!p.stream}
              onClick={() => p.stream && onWatchStream(p.stream.id)}
            >
              <Video size={16} />
              Lihat Siaran
            </button>
            <button
              type="button"
              className="btn-secondary btn-md"
              onClick={() => onAssignMission(p.id)}
            >
              <Target size={16} />
              Beri Misi
            </button>
            <button type="button" className="btn-secondary btn-md" onClick={() => onOpenChat(p.id)}>
              <MessageSquare size={16} />
              Kirim Pesan
            </button>
            <button
              type="button"
              className="btn-secondary btn-md"
              disabled={p.lat == null || p.lng == null}
              onClick={() => {
                if (p.lat == null || p.lng == null) return;
                window.dispatchEvent(
                  new CustomEvent('tocs:locate', { detail: { lat: p.lat, lng: p.lng } })
                );
                onClose();
              }}
            >
              <Crosshair size={16} />
              Lihat di Peta
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}
