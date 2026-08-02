import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Camera, CheckCircle2, MapPin, Pencil, Send, Trash2, Video } from 'lucide-react';
import { useRef, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { Modal, Spinner } from '../../components/ui/Primitives';
import type { GpsState } from '../../hooks/useGpsTracking';
import { api, apiErrorMessage } from '../../lib/api';
import { REPORT_TYPE_LABEL, cx, timeAgo } from '../../lib/format';
import type { Report } from '../../lib/types';

type ReportType = 'information' | 'incident' | 'request_help';

// Selected states are solid on the dark surface: the light "soft" tints used by
// the command dashboard leave light text on a light chip here.
const TYPES: Array<{ value: ReportType; label: string; tone: string }> = [
  {
    value: 'information',
    label: 'Informasi',
    tone: 'peer-checked:border-accent peer-checked:bg-accent peer-checked:text-white',
  },
  {
    value: 'incident',
    label: 'Insiden',
    tone: 'peer-checked:border-warning peer-checked:bg-warning peer-checked:text-ink',
  },
  {
    value: 'request_help',
    label: 'Minta Bantuan',
    tone: 'peer-checked:border-live peer-checked:bg-live peer-checked:text-white',
  },
];

export default function FieldReport() {
  const { gps } = useOutletContext<{ gps: GpsState }>();
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);

  const [type, setType] = useState<ReportType>('information');
  const [description, setDescription] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [editing, setEditing] = useState<Report | null>(null);
  const [deleting, setDeleting] = useState<Report | null>(null);
  const [editText, setEditText] = useState('');

  const history = useQuery({
    queryKey: ['my-reports'],
    queryFn: async () => {
      const { data } = await api.get<{ reports: Report[] }>('/reports', {
        params: { mine: 'true', limit: 10 },
      });
      return data.reports;
    },
  });

  const submit = useMutation({
    mutationFn: async () => {
      const form = new FormData();
      form.append('type', type);
      form.append('description', description.trim());
      if (gps.lat != null && gps.lng != null) {
        form.append('lat', String(gps.lat));
        form.append('lng', String(gps.lng));
      }
      for (const file of files) form.append('media', file);

      await api.post('/reports', form, { headers: { 'Content-Type': 'multipart/form-data' } });
    },
    onSuccess: () => {
      setDescription('');
      setFiles([]);
      setType('information');
      setError(null);
      setSent(true);
      setTimeout(() => setSent(false), 3500);
      void queryClient.invalidateQueries({ queryKey: ['my-reports'] });
    },
    onError: (err) => setError(apiErrorMessage(err, 'Gagal mengirim laporan')),
  });

  const saveEdit = useMutation({
    mutationFn: () =>
      api.patch(`/reports/${editing!.id}`, { description: editText.trim() }),
    onSuccess: () => {
      setEditing(null);
      void queryClient.invalidateQueries({ queryKey: ['my-reports'] });
    },
  });

  const removeReport = useMutation({
    mutationFn: (id: number) => api.delete(`/reports/${id}`),
    onSuccess: () => {
      setDeleting(null);
      void queryClient.invalidateQueries({ queryKey: ['my-reports'] });
    },
  });

  return (
    <div className="field-page">
      <div>
        <h1 className="text-xl font-bold text-white">Kirim Laporan</h1>
        <p className="mt-0.5 text-sm text-white/55">
          Lokasi GPS otomatis dilampirkan pada setiap laporan.
        </p>
      </div>

      {sent && (
        <p className="flex items-center gap-2 rounded-lg border border-success/25 bg-success-soft px-3 py-2.5 text-sm font-medium text-success-strong animate-slide-up">
          <CheckCircle2 size={17} />
          Laporan terkirim ke pusat komando.
        </p>
      )}

      <form
        className="rounded-2xl border border-night-line bg-night-raised space-y-4 p-4"
        onSubmit={(event) => {
          event.preventDefault();
          if (description.trim()) submit.mutate();
        }}
      >
        <div>
          <span className="label">Jenis laporan</span>
          <div className="grid grid-cols-3 gap-2">
            {TYPES.map((option) => (
              <label key={option.value} className="relative cursor-pointer">
                <input
                  type="radio"
                  name="report-type"
                  value={option.value}
                  checked={type === option.value}
                  onChange={() => setType(option.value)}
                  className="peer sr-only"
                />
                <span
                  className={cx(
                    'block rounded-lg border border-night-line bg-night-raised px-2 py-3 text-center text-xs font-semibold text-white/80 transition-colors',
                    option.tone
                  )}
                >
                  {option.label}
                </span>
              </label>
            ))}
          </div>
        </div>

        <div>
          <label className="label" htmlFor="report-description">
            Deskripsi
          </label>
          <textarea
            id="report-description"
            className="field min-h-[140px] resize-y text-base"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Jelaskan situasi di lapangan…"
            required
          />
        </div>

        <div>
          <span className="label">Lampiran ({files.length}/5)</span>
          <input
            ref={fileRef}
            type="file"
            accept="image/*,video/*"
            multiple
            className="hidden"
            onChange={(e) => {
              const picked = Array.from(e.target.files ?? []);
              setFiles((prev) => [...prev, ...picked].slice(0, 5));
              e.target.value = '';
            }}
          />

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => {
                fileRef.current?.setAttribute('capture', 'environment');
                fileRef.current?.click();
              }}
              className="btn-secondary btn-lg"
              disabled={files.length >= 5}
            >
              <Camera size={18} />
              Ambil Foto
            </button>
            <button
              type="button"
              onClick={() => {
                fileRef.current?.removeAttribute('capture');
                fileRef.current?.click();
              }}
              className="btn-secondary btn-lg"
              disabled={files.length >= 5}
            >
              <Video size={18} />
              Pilih Berkas
            </button>
          </div>

          {files.length > 0 && (
            <ul className="mt-2 space-y-1.5">
              {files.map((file, index) => (
                <li
                  key={`${file.name}-${index}`}
                  className="flex items-center gap-2 rounded-lg border border-night-line bg-night px-3 py-2"
                >
                  {file.type.startsWith('video/') ? (
                    <Video size={15} className="shrink-0 text-white/55" />
                  ) : (
                    <Camera size={15} className="shrink-0 text-white/55" />
                  )}
                  <span className="min-w-0 flex-1 truncate text-xs text-white/80">{file.name}</span>
                  <span className="shrink-0 text-[11px] text-white/40">
                    {(file.size / 1024 / 1024).toFixed(1)} MB
                  </span>
                  <button
                    type="button"
                    onClick={() => setFiles((prev) => prev.filter((_, i) => i !== index))}
                    className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-white/55 hover:bg-danger-soft hover:text-danger"
                    aria-label={`Hapus ${file.name}`}
                  >
                    <Trash2 size={14} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <p className="flex items-center gap-1.5 rounded-lg bg-night px-3 py-2 font-mono text-[11px] text-white/55">
          <MapPin size={12} />
          {gps.lat != null && gps.lng != null
            ? `${gps.lat.toFixed(5)}, ${gps.lng.toFixed(5)}`
            : 'Menunggu sinyal GPS…'}
        </p>

        {error && (
          <p className="rounded-lg border border-danger/25 bg-danger-soft px-3 py-2 text-sm text-danger-strong">
            {error}
          </p>
        )}

        <button
          type="submit"
          className="btn-primary h-14 w-full text-base"
          disabled={!description.trim() || submit.isPending}
        >
          {submit.isPending ? <Spinner size={20} /> : <Send size={20} />}
          KIRIM LAPORAN
        </button>
      </form>

      {(history.data?.length ?? 0) > 0 && (
        <section className="rounded-2xl border border-night-line bg-night-raised overflow-hidden">
          <header className="card-header">
            <h2 className="card-title">Laporan Saya</h2>
          </header>
          <ul className="divide-y divide-night-line">
            {history.data!.map((report) => (
              <li key={report.id} className="px-4 py-3">
                <div className="flex items-start justify-between gap-2">
                  <span className="min-w-0 flex-1">
                    <span className="text-xs font-semibold text-white/80">
                      {REPORT_TYPE_LABEL[report.type]}
                      {report.updatedAt && <span className="ml-2 text-white/40">· diubah</span>}
                    </span>
                    <p className="mt-1.5 line-clamp-2 text-sm text-white/80">
                      {report.description}
                    </p>
                    <p className="mt-1 text-[11px] text-white/40">
                      {timeAgo(report.createdAt)} lalu
                    </p>
                  </span>

                  <span className="flex shrink-0 items-center gap-1">
                    <button
                      type="button"
                      onClick={() => {
                        setEditing(report);
                        setEditText(report.description);
                      }}
                      className="grid h-8 w-8 place-items-center rounded-md text-white/55 transition-colors hover:bg-white/10 hover:text-white"
                      aria-label="Ubah laporan"
                    >
                      <Pencil size={15} />
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeleting(report)}
                      className="grid h-8 w-8 place-items-center rounded-md text-white/55 transition-colors hover:bg-danger/20 hover:text-danger"
                      aria-label="Hapus laporan"
                    >
                      <Trash2 size={15} />
                    </button>
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      <Modal
        open={editing != null}
        onClose={() => setEditing(null)}
        title="Ubah Laporan"
        subtitle={editing ? `Laporan #${editing.id}` : ''}
        footer={
          <>
            <button type="button" className="btn-secondary btn-md" onClick={() => setEditing(null)}>
              Batal
            </button>
            <button
              type="button"
              className="btn-primary btn-md"
              onClick={() => saveEdit.mutate()}
              disabled={!editText.trim() || saveEdit.isPending}
            >
              {saveEdit.isPending ? <Spinner size={16} /> : <Pencil size={16} />}
              Simpan
            </button>
          </>
        }
      >
        <label className="label" htmlFor="field-edit-desc">
          Deskripsi
        </label>
        <textarea
          id="field-edit-desc"
          className="field min-h-[140px] resize-y text-base"
          value={editText}
          onChange={(e) => setEditText(e.target.value)}
        />
      </Modal>

      <Modal
        open={deleting != null}
        onClose={() => setDeleting(null)}
        title="Hapus laporan?"
        subtitle={deleting ? `Laporan #${deleting.id}` : ''}
        footer={
          <>
            <button type="button" className="btn-secondary btn-md" onClick={() => setDeleting(null)}>
              Batal
            </button>
            <button
              type="button"
              className="btn-danger btn-md"
              onClick={() => deleting && removeReport.mutate(deleting.id)}
              disabled={removeReport.isPending}
            >
              {removeReport.isPending ? <Spinner size={16} /> : <Trash2 size={16} />}
              Hapus
            </button>
          </>
        }
      >
        <p className="text-sm text-ink-soft">
          Laporan beserta lampirannya akan dihapus permanen.
        </p>
      </Modal>
    </div>
  );
}
