import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Download, FileText, Paperclip, Pencil, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { api, apiErrorMessage, tokenStore } from '../../lib/api';
import { BRAND_SLUG } from '../../lib/brand';
import { REPORT_TYPE_LABEL, cx, formatDateTime, timeAgo } from '../../lib/format';
import type { Report } from '../../lib/types';
import { useAuth } from '../../store/auth';
import { EmptyState, Modal, PanelLoading, Spinner } from '../ui/Primitives';

type ReportType = 'information' | 'incident' | 'request_help';

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
  const [filter, setFilter] = useState<'all' | ReportType>('all');
  const [detail, setDetail] = useState<Report | null>(null);
  const [editing, setEditing] = useState<Report | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Report | null>(null);
  const [exporting, setExporting] = useState(false);

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['reports'] });
    void queryClient.invalidateQueries({ queryKey: ['map'] });
    void queryClient.invalidateQueries({ queryKey: ['stats'] });
  };

  const remove = useMutation({
    mutationFn: (id: number) => api.delete(`/reports/${id}`),
    onSuccess: () => {
      invalidate();
      setConfirmDelete(null);
      setDetail(null);
    },
  });

  const rows = reports.filter((r) => filter === 'all' || r.type === filter);

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
      link.download = `${BRAND_SLUG}-reports-${new Date().toISOString().slice(0, 10)}.csv`;
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
          <span className="ml-1 rounded-full bg-canvas-sunken px-2 py-0.5 text-[11px] font-medium text-ink-muted">
            {reports.length}
          </span>
        </h2>

        <div className="flex items-center gap-2">
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value as typeof filter)}
            className="field h-8 w-auto py-0 text-xs"
            aria-label="Filter jenis laporan"
          >
            <option value="all">Semua jenis</option>
            <option value="information">Informasi</option>
            <option value="incident">Insiden</option>
            <option value="request_help">Permintaan Bantuan</option>
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
                      {report.media.length > 0 && (
                        <span className="chip bg-canvas-sunken text-ink-muted">
                          <Paperclip size={11} /> {report.media.length}
                        </span>
                      )}
                      {report.updatedAt && (
                        <span className="chip bg-canvas-sunken text-ink-muted">diubah</span>
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

                <div className="flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setEditing(report)}
                    className="grid h-7 w-7 place-items-center rounded-md text-ink-muted transition-colors hover:bg-accent-soft hover:text-accent"
                    title="Ubah laporan"
                  >
                    <Pencil size={15} />
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmDelete(report)}
                    className="grid h-7 w-7 place-items-center rounded-md text-ink-muted transition-colors hover:bg-danger-soft hover:text-danger"
                    title="Hapus laporan"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Detail */}
      <Modal
        open={detail != null}
        onClose={() => setDetail(null)}
        title={detail?.title ?? `Laporan #${detail?.id ?? ''}`}
        subtitle={detail ? `${detail.reporter.fullName} · ${formatDateTime(detail.createdAt)}` : ''}
        footer={
          detail ? (
            <>
              <button
                type="button"
                className="btn-secondary btn-md"
                onClick={() => {
                  setEditing(detail);
                  setDetail(null);
                }}
              >
                <Pencil size={16} />
                Ubah
              </button>
              <button
                type="button"
                className="btn-danger btn-md"
                onClick={() => setConfirmDelete(detail)}
              >
                <Trash2 size={16} />
                Hapus
              </button>
            </>
          ) : null
        }
      >
        {detail && (
          <div className="space-y-4">
            <span className={cx('chip', TYPE_TONE[detail.type])}>
              {REPORT_TYPE_LABEL[detail.type]}
            </span>

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
                <dd className="mt-0.5 font-medium text-ink">{detail.reporter.unitName ?? '—'}</dd>
              </div>
              <div>
                <dt className="text-xs text-ink-muted">Terakhir diubah</dt>
                <dd className="mt-0.5 font-medium text-ink">
                  {detail.updatedAt ? formatDateTime(detail.updatedAt) : 'Belum pernah'}
                </dd>
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

      <EditReportModal report={editing} onClose={() => setEditing(null)} onSaved={invalidate} />

      <Modal
        open={confirmDelete != null}
        onClose={() => setConfirmDelete(null)}
        title="Hapus laporan?"
        subtitle={confirmDelete ? `Laporan #${confirmDelete.id} · ${confirmDelete.reporter.fullName}` : ''}
        footer={
          <>
            <button
              type="button"
              className="btn-secondary btn-md"
              onClick={() => setConfirmDelete(null)}
            >
              Batal
            </button>
            <button
              type="button"
              className="btn-danger btn-md"
              onClick={() => confirmDelete && remove.mutate(confirmDelete.id)}
              disabled={remove.isPending}
            >
              {remove.isPending ? <Spinner size={16} /> : <Trash2 size={16} />}
              Hapus
            </button>
          </>
        }
      >
        <p className="text-sm text-ink-soft">
          Laporan ini{' '}
          {confirmDelete?.media.length
            ? `beserta ${confirmDelete.media.length} lampirannya `
            : ''}
          akan dihapus permanen. Tindakan ini tidak dapat dibatalkan dan tercatat di audit log.
        </p>
      </Modal>
    </section>
  );
}

/* --------------------------------------------------------------- edit ----- */

function EditReportModal({
  report,
  onClose,
  onSaved,
}: {
  report: Report | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [type, setType] = useState<ReportType>('information');
  const [description, setDescription] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!report) return;
    setType(report.type);
    setDescription(report.description);
    setError(null);
  }, [report]);

  const save = useMutation({
    mutationFn: () =>
      api.patch(`/reports/${report!.id}`, { type, description: description.trim() }),
    onSuccess: () => {
      onSaved();
      onClose();
    },
    onError: (err) => setError(apiErrorMessage(err, 'Gagal menyimpan perubahan')),
  });

  return (
    <Modal
      open={report != null}
      onClose={onClose}
      title="Ubah Laporan"
      subtitle={report ? `Laporan #${report.id} · ${report.reporter.fullName}` : ''}
      footer={
        <>
          <button type="button" className="btn-secondary btn-md" onClick={onClose}>
            Batal
          </button>
          <button
            type="button"
            className="btn-primary btn-md"
            onClick={() => save.mutate()}
            disabled={!description.trim() || save.isPending}
          >
            {save.isPending ? <Spinner size={16} /> : <Pencil size={16} />}
            Simpan
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <label className="label" htmlFor="edit-report-type">
            Jenis laporan
          </label>
          <select
            id="edit-report-type"
            className="field"
            value={type}
            onChange={(e) => setType(e.target.value as ReportType)}
          >
            <option value="information">Informasi</option>
            <option value="incident">Insiden</option>
            <option value="request_help">Permintaan Bantuan</option>
          </select>
        </div>

        <div>
          <label className="label" htmlFor="edit-report-description">
            Deskripsi
          </label>
          <textarea
            id="edit-report-description"
            className="field min-h-[140px] resize-y"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>

        {error && (
          <p className="rounded-lg border border-danger/25 bg-danger-soft px-3 py-2 text-sm text-danger-strong">
            {error}
          </p>
        )}
      </div>
    </Modal>
  );
}
