import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Check, Download, FileText, Paperclip, X } from 'lucide-react';
import { useState } from 'react';
import { api, tokenStore } from '../../lib/api';
import {
  REPORT_STATUS_CHIP,
  REPORT_STATUS_LABEL,
  REPORT_TYPE_LABEL,
  cx,
  formatDateTime,
  timeAgo,
} from '../../lib/format';
import type { Report } from '../../lib/types';
import { EmptyState, Modal, PanelLoading, Spinner } from '../ui/Primitives';
import { useAuth } from '../../store/auth';

const TYPE_TONE: Record<string, string> = {
  information: 'bg-canvas-sunken text-ink-muted',
  incident: 'bg-warning-soft text-warning-strong',
  request_help: 'bg-danger-soft text-danger-strong',
};

export default function ReportsPanel({
  reports,
  loading,
}: {
  reports: Report[];
  loading: boolean;
}) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<'all' | 'pending' | 'verified' | 'rejected'>('all');
  const [detail, setDetail] = useState<Report | null>(null);
  const [exporting, setExporting] = useState(false);

  const verify = useMutation({
    mutationFn: ({ id, status }: { id: number; status: 'verified' | 'rejected' }) =>
      api.post(`/reports/${id}/verify`, { status }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['reports'] });
      setDetail(null);
    },
  });

  const rows = reports.filter((r) => filter === 'all' || r.status === filter);
  const pending = reports.filter((r) => r.status === 'pending').length;

  /** Streams the CSV through fetch so the auth header is preserved. */
  async function exportCsv() {
    setExporting(true);
    try {
      const response = await fetch(`${api.defaults.baseURL}/reports/export/csv`, {
        headers: { Authorization: `Bearer ${tokenStore.get() ?? ''}` },
        credentials: 'include',
      });
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `tocs-reports-${new Date().toISOString().slice(0, 10)}.csv`;
      link.click();
      URL.revokeObjectURL(url);
    } finally {
      setExporting(false);
    }
  }

  return (
    <section className="card flex h-full min-h-[340px] flex-col overflow-hidden">
      <header className="card-header">
        <h2 className="card-title">
          <FileText size={16} className="text-warning" />
          Laporan Lapangan
          {pending > 0 && (
            <span className="ml-1 rounded-full bg-warning-soft px-2 py-0.5 text-[11px] font-medium text-warning-strong">
              {pending} menunggu
            </span>
          )}
        </h2>

        <div className="flex items-center gap-2">
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value as typeof filter)}
            className="field h-8 w-auto py-0 text-xs"
            aria-label="Filter status laporan"
          >
            <option value="all">Semua</option>
            <option value="pending">Menunggu</option>
            <option value="verified">Terverifikasi</option>
            <option value="rejected">Ditolak</option>
          </select>

          {user?.role === 'superuser' && (
            <button
              type="button"
              className="btn-secondary btn-sm"
              onClick={exportCsv}
              disabled={exporting}
            >
              {exporting ? <Spinner size={14} /> : <Download size={14} />}
              <span className="hidden lg:inline">Ekspor</span>
            </button>
          )}
        </div>
      </header>

      <div className="panel-scroll min-h-0 flex-1">
        {loading && reports.length === 0 ? (
          <PanelLoading />
        ) : rows.length === 0 ? (
          <EmptyState title="Tidak ada laporan" hint="Laporan personel akan muncul di sini." />
        ) : (
          <ul className="divide-y divide-line">
            {rows.map((report) => (
              <li key={report.id} className="flex items-start gap-2 px-4 py-3 hover:bg-canvas">
                <button
                  type="button"
                  onClick={() => setDetail(report)}
                  className="flex min-w-0 flex-1 items-start gap-3 text-left"
                >
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className={cx('chip', TYPE_TONE[report.type])}>
                        {REPORT_TYPE_LABEL[report.type]}
                      </span>
                      <span className={cx('chip', REPORT_STATUS_CHIP[report.status])}>
                        {REPORT_STATUS_LABEL[report.status]}
                      </span>
                      {report.media.length > 0 && (
                        <span className="chip bg-canvas-sunken text-ink-muted">
                          <Paperclip size={11} /> {report.media.length}
                        </span>
                      )}
                    </span>

                    <span className="mt-1.5 block line-clamp-2 text-sm leading-snug text-ink-soft">
                      {report.description}
                    </span>
                    <span className="mt-1 block text-xs text-ink-muted">
                      {report.reporter.fullName} · {report.reporter.unitName ?? 'Tanpa unit'} ·{' '}
                      {timeAgo(report.createdAt)} lalu
                    </span>
                  </span>
                </button>

                {report.status === 'pending' && (
                  <div className="flex shrink-0 items-center gap-1">
                    <button
                      type="button"
                      onClick={() => verify.mutate({ id: report.id, status: 'verified' })}
                      className="grid h-7 w-7 place-items-center rounded-md text-ink-muted transition-colors hover:bg-success-soft hover:text-success-strong"
                      title="Verifikasi"
                    >
                      <Check size={15} />
                    </button>
                    <button
                      type="button"
                      onClick={() => verify.mutate({ id: report.id, status: 'rejected' })}
                      className="grid h-7 w-7 place-items-center rounded-md text-ink-muted transition-colors hover:bg-danger-soft hover:text-danger-strong"
                      title="Tolak"
                    >
                      <X size={15} />
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      <Modal
        open={detail != null}
        onClose={() => setDetail(null)}
        title={detail?.title ?? `Laporan #${detail?.id ?? ''}`}
        subtitle={detail ? `${detail.reporter.fullName} · ${formatDateTime(detail.createdAt)}` : ''}
        footer={
          detail?.status === 'pending' ? (
            <>
              <button
                type="button"
                className="btn-secondary btn-md"
                onClick={() => verify.mutate({ id: detail.id, status: 'rejected' })}
                disabled={verify.isPending}
              >
                <X size={16} />
                Tolak
              </button>
              <button
                type="button"
                className="btn-primary btn-md"
                onClick={() => verify.mutate({ id: detail.id, status: 'verified' })}
                disabled={verify.isPending}
              >
                {verify.isPending ? <Spinner size={16} /> : <Check size={16} />}
                Verifikasi
              </button>
            </>
          ) : null
        }
      >
        {detail && (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <span className={cx('chip', TYPE_TONE[detail.type])}>
                {REPORT_TYPE_LABEL[detail.type]}
              </span>
              <span className={cx('chip', REPORT_STATUS_CHIP[detail.status])}>
                {REPORT_STATUS_LABEL[detail.status]}
              </span>
            </div>

            <p className="whitespace-pre-wrap text-sm leading-relaxed text-ink-soft">
              {detail.description}
            </p>

            {detail.media.length > 0 && (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {detail.media.map((media) =>
                  media.kind === 'video' ? (
                    <video
                      key={media.id}
                      src={media.url}
                      controls
                      className="aspect-video w-full rounded-lg border border-line bg-ink object-cover"
                    />
                  ) : (
                    <a
                      key={media.id}
                      href={media.url}
                      target="_blank"
                      rel="noreferrer"
                      className="block overflow-hidden rounded-lg border border-line"
                    >
                      <img
                        src={media.url}
                        alt="Lampiran laporan"
                        className="aspect-video w-full object-cover transition-transform hover:scale-105"
                      />
                    </a>
                  )
                )}
              </div>
            )}

            <dl className="grid grid-cols-2 gap-3 rounded-xl border border-line bg-canvas p-3.5 text-sm">
              <div>
                <dt className="text-xs text-ink-muted">Unit</dt>
                <dd className="mt-0.5 font-medium text-ink">
                  {detail.reporter.unitName ?? '—'}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-ink-muted">Diverifikasi oleh</dt>
                <dd className="mt-0.5 font-medium text-ink">{detail.verifiedByName ?? '—'}</dd>
              </div>
              <div className="col-span-2">
                <dt className="text-xs text-ink-muted">Koordinat</dt>
                <dd className="mt-0.5 font-mono text-xs text-ink">
                  {detail.lat != null && detail.lng != null
                    ? `${detail.lat.toFixed(5)}, ${detail.lng.toFixed(5)}`
                    : 'GPS tidak terlampir'}
                </dd>
              </div>
            </dl>

            {detail.lat != null && detail.lng != null && (
              <button
                type="button"
                className="btn-secondary btn-md w-full"
                onClick={() => {
                  window.dispatchEvent(
                    new CustomEvent('tocs:locate', { detail: { lat: detail.lat, lng: detail.lng } })
                  );
                  setDetail(null);
                }}
              >
                Tampilkan lokasi di peta
              </button>
            )}
          </div>
        )}
      </Modal>
    </section>
  );
}
