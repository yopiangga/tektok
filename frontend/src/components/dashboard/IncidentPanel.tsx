import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle2, Eye, Plus, UserPlus } from 'lucide-react';
import { useState } from 'react';
import { api, apiErrorMessage } from '../../lib/api';
import {
  INCIDENT_STATUS_CHIP,
  INCIDENT_STATUS_LABEL,
  PRIORITY_CHIP,
  PRIORITY_LABEL,
  cx,
  formatDateTime,
  timeAgo,
} from '../../lib/format';
import type { Incident, Personnel, Priority } from '../../lib/types';
import { EmptyState, Modal, PanelLoading, Spinner } from '../ui/Primitives';

export default function IncidentPanel({
  incidents,
  personnel,
  loading,
}: {
  incidents: Incident[];
  personnel: Personnel[];
  loading: boolean;
}) {
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [detail, setDetail] = useState<Incident | null>(null);
  const [assignFor, setAssignFor] = useState<Incident | null>(null);

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['incidents'] });
    void queryClient.invalidateQueries({ queryKey: ['stats'] });
    void queryClient.invalidateQueries({ queryKey: ['map'] });
  };

  const closeIncident = useMutation({
    mutationFn: (id: number) => api.post(`/incidents/${id}/close`),
    onSuccess: () => {
      invalidate();
      setDetail(null);
    },
  });

  return (
    <section className="card flex h-full min-h-[360px] flex-col overflow-hidden">
      <header className="card-header">
        <h2 className="card-title">
          <AlertTriangle size={16} className="text-danger" />
          Insiden
          <span className="ml-1 rounded-full bg-danger-soft px-2 py-0.5 text-[11px] font-medium text-danger-strong">
            {incidents.filter((i) => i.status !== 'closed').length} terbuka
          </span>
        </h2>
        <button type="button" className="btn-primary btn-sm" onClick={() => setCreateOpen(true)}>
          <Plus size={14} />
          Insiden Baru
        </button>
      </header>

      <div className="panel-scroll min-h-0 flex-1">
        {loading && incidents.length === 0 ? (
          <PanelLoading />
        ) : incidents.length === 0 ? (
          <EmptyState title="Tidak ada insiden" hint="Semua area dalam kondisi terkendali." />
        ) : (
          <table className="w-full border-collapse">
            <thead className="table-head">
              <tr>
                <th>Prioritas</th>
                <th>Judul</th>
                <th className="hidden lg:table-cell">Lokasi</th>
                <th className="hidden xl:table-cell">Pelapor</th>
                <th className="hidden sm:table-cell">Dibuat</th>
                <th>Status</th>
                <th className="text-right">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {incidents.map((incident) => (
                <tr key={incident.id} className="table-row" onClick={() => setDetail(incident)}>
                  <td>
                    <span className={cx('chip', PRIORITY_CHIP[incident.priority])}>
                      {PRIORITY_LABEL[incident.priority]}
                    </span>
                  </td>
                  <td className="max-w-[16rem]">
                    <p className="truncate font-medium text-ink">{incident.title}</p>
                  </td>
                  <td className="hidden max-w-[12rem] truncate text-ink-muted lg:table-cell">
                    {incident.location ?? '—'}
                  </td>
                  <td className="hidden max-w-[10rem] truncate text-ink-muted xl:table-cell">
                    {incident.reporter?.fullName ?? '—'}
                  </td>
                  <td className="hidden whitespace-nowrap text-xs text-ink-muted sm:table-cell">
                    {timeAgo(incident.createdAt)} lalu
                  </td>
                  <td>
                    <span className={cx('chip', INCIDENT_STATUS_CHIP[incident.status])}>
                      {INCIDENT_STATUS_LABEL[incident.status]}
                    </span>
                  </td>
                  <td onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center justify-end gap-1">
                      <button
                        type="button"
                        onClick={() => setDetail(incident)}
                        className="grid h-7 w-7 place-items-center rounded-md text-ink-muted transition-colors hover:bg-canvas-sunken hover:text-ink"
                        title="Lihat"
                      >
                        <Eye size={15} />
                      </button>
                      <button
                        type="button"
                        onClick={() => setAssignFor(incident)}
                        className="grid h-7 w-7 place-items-center rounded-md text-ink-muted transition-colors hover:bg-accent-soft hover:text-accent"
                        title="Tugaskan"
                        disabled={incident.status === 'closed'}
                      >
                        <UserPlus size={15} />
                      </button>
                      <button
                        type="button"
                        onClick={() => closeIncident.mutate(incident.id)}
                        className="grid h-7 w-7 place-items-center rounded-md text-ink-muted transition-colors hover:bg-success-soft hover:text-success-strong disabled:opacity-40"
                        title="Tutup insiden"
                        disabled={incident.status === 'closed' || closeIncident.isPending}
                      >
                        <CheckCircle2 size={15} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <CreateIncidentModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        personnel={personnel}
        onCreated={invalidate}
      />

      <AssignIncidentModal
        incident={assignFor}
        personnel={personnel}
        onClose={() => setAssignFor(null)}
        onAssigned={invalidate}
      />

      <Modal
        open={detail != null}
        onClose={() => setDetail(null)}
        title={detail?.title ?? ''}
        subtitle={detail ? `Insiden #${detail.id}` : ''}
        footer={
          detail && detail.status !== 'closed' ? (
            <button
              type="button"
              className="btn-primary btn-md"
              onClick={() => closeIncident.mutate(detail.id)}
              disabled={closeIncident.isPending}
            >
              {closeIncident.isPending ? <Spinner size={16} /> : <CheckCircle2 size={16} />}
              Tutup Insiden
            </button>
          ) : null
        }
      >
        {detail && (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <span className={cx('chip', PRIORITY_CHIP[detail.priority])}>
                Prioritas {PRIORITY_LABEL[detail.priority]}
              </span>
              <span className={cx('chip', INCIDENT_STATUS_CHIP[detail.status])}>
                {INCIDENT_STATUS_LABEL[detail.status]}
              </span>
            </div>

            <p className="text-sm leading-relaxed text-ink-soft">
              {detail.description ?? 'Tidak ada deskripsi tambahan.'}
            </p>

            <dl className="grid grid-cols-2 gap-3 rounded-xl border border-line bg-canvas p-3.5 text-sm">
              <div>
                <dt className="text-xs text-ink-muted">Lokasi</dt>
                <dd className="mt-0.5 font-medium text-ink">{detail.location ?? '—'}</dd>
              </div>
              <div>
                <dt className="text-xs text-ink-muted">Pelapor</dt>
                <dd className="mt-0.5 font-medium text-ink">{detail.reporter?.fullName ?? '—'}</dd>
              </div>
              <div>
                <dt className="text-xs text-ink-muted">Penanggung Jawab</dt>
                <dd className="mt-0.5 font-medium text-ink">{detail.assignee?.fullName ?? '—'}</dd>
              </div>
              <div>
                <dt className="text-xs text-ink-muted">Dibuat</dt>
                <dd className="mt-0.5 font-medium text-ink">{formatDateTime(detail.createdAt)}</dd>
              </div>
            </dl>

            {detail.lat != null && detail.lng != null && (
              <button
                type="button"
                className="btn-secondary btn-md w-full"
                onClick={() => {
                  window.dispatchEvent(
                    new CustomEvent('tocs:locate', {
                      detail: { lat: detail.lat, lng: detail.lng },
                    })
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

/* ------------------------------------------------------------ Create ------ */

function CreateIncidentModal({
  open,
  onClose,
  personnel,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  personnel: Personnel[];
  onCreated: () => void;
}) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<Priority>('medium');
  const [location, setLocation] = useState('');
  const [reporterId, setReporterId] = useState<string>('');
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setTitle('');
    setDescription('');
    setPriority('medium');
    setLocation('');
    setReporterId('');
    setError(null);
  };

  const create = useMutation({
    mutationFn: async () => {
      const reporter = personnel.find((p) => String(p.id) === reporterId);
      await api.post('/incidents', {
        title: title.trim(),
        description: description.trim() || undefined,
        priority,
        location: location.trim() || undefined,
        reporterId: reporter?.id,
        // Anchor the marker to the reporter's last known position.
        lat: reporter?.lat ?? undefined,
        lng: reporter?.lng ?? undefined,
      });
    },
    onSuccess: () => {
      onCreated();
      reset();
      onClose();
    },
    onError: (err) => setError(apiErrorMessage(err, 'Gagal membuat insiden')),
  });

  return (
    <Modal
      open={open}
      onClose={() => {
        reset();
        onClose();
      }}
      title="Buat Insiden Baru"
      subtitle="Insiden akan langsung tampil di peta dan panel komando."
      footer={
        <>
          <button
            type="button"
            className="btn-secondary btn-md"
            onClick={() => {
              reset();
              onClose();
            }}
          >
            Batal
          </button>
          <button
            type="button"
            className="btn-primary btn-md"
            onClick={() => create.mutate()}
            disabled={!title.trim() || create.isPending}
          >
            {create.isPending ? <Spinner size={16} /> : <Plus size={16} />}
            Buat Insiden
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <label className="label" htmlFor="incident-title">
            Judul insiden
          </label>
          <input
            id="incident-title"
            className="field"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Contoh: Kericuhan di gerbang utara"
            autoFocus
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label" htmlFor="incident-priority">
              Prioritas
            </label>
            <select
              id="incident-priority"
              className="field"
              value={priority}
              onChange={(e) => setPriority(e.target.value as Priority)}
            >
              {(['low', 'medium', 'high', 'critical'] as Priority[]).map((p) => (
                <option key={p} value={p}>
                  {PRIORITY_LABEL[p]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="incident-location">
              Lokasi
            </label>
            <input
              id="incident-location"
              className="field"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="Nama lokasi"
            />
          </div>
        </div>

        <div>
          <label className="label" htmlFor="incident-reporter">
            Pelapor (opsional)
          </label>
          <select
            id="incident-reporter"
            className="field"
            value={reporterId}
            onChange={(e) => setReporterId(e.target.value)}
          >
            <option value="">— Tidak ditentukan —</option>
            {personnel.map((p) => (
              <option key={p.id} value={p.id}>
                {p.fullName} · {p.unit?.code ?? '—'}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="label" htmlFor="incident-description">
            Deskripsi
          </label>
          <textarea
            id="incident-description"
            className="field min-h-[96px] resize-y"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Uraikan kronologi singkat dan tindakan yang diperlukan…"
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

/* ------------------------------------------------------------ Assign ------ */

function AssignIncidentModal({
  incident,
  personnel,
  onClose,
  onAssigned,
}: {
  incident: Incident | null;
  personnel: Personnel[];
  onClose: () => void;
  onAssigned: () => void;
}) {
  const [assigneeId, setAssigneeId] = useState<string>('');
  const [error, setError] = useState<string | null>(null);

  const assign = useMutation({
    mutationFn: () =>
      api.post(`/incidents/${incident!.id}/assign`, { assigneeId: Number(assigneeId) }),
    onSuccess: () => {
      onAssigned();
      setAssigneeId('');
      onClose();
    },
    onError: (err) => setError(apiErrorMessage(err, 'Gagal menugaskan personel')),
  });

  return (
    <Modal
      open={incident != null}
      onClose={onClose}
      title="Tugaskan Penanganan"
      subtitle={incident?.title}
      footer={
        <>
          <button type="button" className="btn-secondary btn-md" onClick={onClose}>
            Batal
          </button>
          <button
            type="button"
            className="btn-primary btn-md"
            onClick={() => assign.mutate()}
            disabled={!assigneeId || assign.isPending}
          >
            {assign.isPending ? <Spinner size={16} /> : <UserPlus size={16} />}
            Tugaskan
          </button>
        </>
      }
    >
      <label className="label" htmlFor="incident-assignee">
        Personel penanggung jawab
      </label>
      <select
        id="incident-assignee"
        className="field"
        value={assigneeId}
        onChange={(e) => setAssigneeId(e.target.value)}
      >
        <option value="">— Pilih personel —</option>
        {personnel
          .filter((p) => p.status !== 'offline')
          .map((p) => (
            <option key={p.id} value={p.id}>
              {p.fullName} · {p.unit?.code ?? '—'}
            </option>
          ))}
      </select>
      {error && <p className="mt-3 text-sm text-danger-strong">{error}</p>}
    </Modal>
  );
}
