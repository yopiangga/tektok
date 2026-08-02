import { useMutation, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, Eye, Pencil, Plus, Target } from 'lucide-react';
import { useEffect, useState } from 'react';
import { api, apiErrorMessage } from '../../lib/api';
import {
  MISSION_STATUS_CHIP,
  MISSION_STATUS_LABEL,
  PRIORITY_CHIP,
  PRIORITY_LABEL,
  cx,
  formatDateTime,
} from '../../lib/format';
import type { Mission, Personnel, Priority } from '../../lib/types';
import { EmptyState, Modal, PanelLoading, Spinner } from '../ui/Primitives';

export default function MissionPanel({
  missions,
  personnel,
  loading,
  createFor,
  onCreateForHandled,
}: {
  missions: Mission[];
  personnel: Personnel[];
  loading: boolean;
  /** Pre-selects an assignee when opened from the personnel detail modal. */
  createFor: number | null;
  onCreateForHandled: () => void;
}) {
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [detail, setDetail] = useState<Mission | null>(null);
  const [editing, setEditing] = useState<Mission | null>(null);

  useEffect(() => {
    if (createFor != null) setCreateOpen(true);
  }, [createFor]);

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['missions'] });
    void queryClient.invalidateQueries({ queryKey: ['stats'] });
    void queryClient.invalidateQueries({ queryKey: ['personnel'] });
    void queryClient.invalidateQueries({ queryKey: ['map'] });
  };

  const complete = useMutation({
    mutationFn: (id: number) => api.post(`/missions/${id}/complete`),
    onSuccess: () => {
      invalidate();
      setDetail(null);
    },
  });

  return (
    <section className="card flex h-full min-h-[360px] flex-col overflow-hidden">
      <header className="card-header">
        <h2 className="card-title">
          <Target size={16} className="text-accent" />
          Daftar Misi
          <span className="ml-1 rounded-full bg-canvas-sunken px-2 py-0.5 text-[11px] font-medium text-ink-muted">
            {missions.filter((m) => m.status !== 'completed' && m.status !== 'cancelled').length} aktif
          </span>
        </h2>
        <button type="button" className="btn-primary btn-sm" onClick={() => setCreateOpen(true)}>
          <Plus size={14} />
          Misi Baru
        </button>
      </header>

      <div className="panel-scroll min-h-0 flex-1">
        {loading && missions.length === 0 ? (
          <PanelLoading />
        ) : missions.length === 0 ? (
          <EmptyState title="Belum ada misi" hint="Buat misi untuk menugaskan personel di lapangan." />
        ) : (
          <table className="w-full border-collapse">
            <thead className="table-head">
              <tr>
                <th>Personel</th>
                <th>Misi</th>
                <th className="hidden sm:table-cell">Prioritas</th>
                <th>Status</th>
                <th className="hidden lg:table-cell">Tenggat</th>
                <th className="text-right">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {missions.map((mission) => (
                <tr key={mission.id} className="table-row" onClick={() => setDetail(mission)}>
                  <td className="max-w-[11rem]">
                    {mission.assignees.length === 0 ? (
                      <span className="text-ink-faint">Belum ditugaskan</span>
                    ) : (
                      <div className="min-w-0">
                        <p className="truncate font-medium text-ink">
                          {mission.assignees[0].fullName}
                        </p>
                        {mission.assignees.length > 1 && (
                          <p className="text-xs text-ink-muted">
                            +{mission.assignees.length - 1} personel lain
                          </p>
                        )}
                      </div>
                    )}
                  </td>
                  <td className="max-w-[16rem]">
                    <p className="truncate font-medium text-ink">{mission.title}</p>
                  </td>
                  <td className="hidden sm:table-cell">
                    <span className={cx('chip', PRIORITY_CHIP[mission.priority])}>
                      {PRIORITY_LABEL[mission.priority]}
                    </span>
                  </td>
                  <td>
                    <span className={cx('chip', MISSION_STATUS_CHIP[mission.status])}>
                      {MISSION_STATUS_LABEL[mission.status]}
                    </span>
                  </td>
                  <td className="hidden whitespace-nowrap text-xs text-ink-muted lg:table-cell">
                    {mission.deadline ? formatDateTime(mission.deadline) : '—'}
                  </td>
                  <td onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center justify-end gap-1">
                      <button
                        type="button"
                        onClick={() => setDetail(mission)}
                        className="grid h-7 w-7 place-items-center rounded-md text-ink-muted transition-colors hover:bg-canvas-sunken hover:text-ink"
                        title="Lihat"
                      >
                        <Eye size={15} />
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditing(mission)}
                        className="grid h-7 w-7 place-items-center rounded-md text-ink-muted transition-colors hover:bg-accent-soft hover:text-accent"
                        title="Ubah"
                      >
                        <Pencil size={15} />
                      </button>
                      <button
                        type="button"
                        onClick={() => complete.mutate(mission.id)}
                        className="grid h-7 w-7 place-items-center rounded-md text-ink-muted transition-colors hover:bg-success-soft hover:text-success-strong disabled:opacity-40"
                        title="Tandai selesai"
                        disabled={mission.status === 'completed' || complete.isPending}
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

      <CreateMissionModal
        open={createOpen}
        preselected={createFor}
        personnel={personnel}
        onClose={() => {
          setCreateOpen(false);
          onCreateForHandled();
        }}
        onCreated={invalidate}
      />

      <EditMissionModal
        mission={editing}
        onClose={() => setEditing(null)}
        onSaved={invalidate}
      />

      <Modal
        open={detail != null}
        onClose={() => setDetail(null)}
        title={detail?.title ?? ''}
        subtitle={detail ? `Misi #${detail.id}` : ''}
        footer={
          detail && detail.status !== 'completed' ? (
            <button
              type="button"
              className="btn-primary btn-md"
              onClick={() => complete.mutate(detail.id)}
              disabled={complete.isPending}
            >
              {complete.isPending ? <Spinner size={16} /> : <CheckCircle2 size={16} />}
              Tandai Selesai
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
              <span className={cx('chip', MISSION_STATUS_CHIP[detail.status])}>
                {MISSION_STATUS_LABEL[detail.status]}
              </span>
            </div>

            <p className="text-sm leading-relaxed text-ink-soft">
              {detail.description ?? 'Tidak ada deskripsi tambahan.'}
            </p>

            <dl className="grid grid-cols-2 gap-3 rounded-xl border border-line bg-canvas p-3.5 text-sm">
              <div>
                <dt className="text-xs text-ink-muted">Komandan</dt>
                <dd className="mt-0.5 font-medium text-ink">{detail.commanderName ?? '—'}</dd>
              </div>
              <div>
                <dt className="text-xs text-ink-muted">Dibuat</dt>
                <dd className="mt-0.5 font-medium text-ink">{formatDateTime(detail.createdAt)}</dd>
              </div>
              <div>
                <dt className="text-xs text-ink-muted">Tenggat</dt>
                <dd className="mt-0.5 font-medium text-ink">
                  {detail.deadline ? formatDateTime(detail.deadline) : '—'}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-ink-muted">Selesai</dt>
                <dd className="mt-0.5 font-medium text-ink">
                  {detail.completedAt ? formatDateTime(detail.completedAt) : '—'}
                </dd>
              </div>
            </dl>

            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">
                Personel Ditugaskan ({detail.assignees.length})
              </p>
              {detail.assignees.length === 0 ? (
                <p className="text-sm text-ink-muted">Belum ada personel yang ditugaskan.</p>
              ) : (
                <ul className="space-y-1.5">
                  {detail.assignees.map((a) => (
                    <li
                      key={a.id}
                      className="flex items-center justify-between rounded-lg border border-line bg-canvas px-3 py-2 text-sm"
                    >
                      <span className="min-w-0">
                        <span className="block truncate font-medium text-ink">{a.fullName}</span>
                        <span className="block truncate text-xs text-ink-muted">
                          {a.badgeNumber ?? '—'} · {a.unitName ?? 'Tanpa unit'}
                        </span>
                      </span>
                      <span className="chip bg-canvas-sunken text-ink-muted">{a.status}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
      </Modal>
    </section>
  );
}

/* ------------------------------------------------------------ Create ------ */

function CreateMissionModal({
  open,
  preselected,
  personnel,
  onClose,
  onCreated,
}: {
  open: boolean;
  preselected: number | null;
  personnel: Personnel[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<Priority>('medium');
  const [deadline, setDeadline] = useState('');
  const [selected, setSelected] = useState<number[]>([]);
  const [term, setTerm] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open && preselected != null) setSelected([preselected]);
  }, [open, preselected]);

  const reset = () => {
    setTitle('');
    setDescription('');
    setPriority('medium');
    setDeadline('');
    setSelected([]);
    setTerm('');
    setError(null);
  };

  const create = useMutation({
    mutationFn: async () => {
      const anchor = personnel.find((p) => p.id === selected[0]);
      await api.post('/missions', {
        title: title.trim(),
        description: description.trim() || undefined,
        priority,
        deadline: deadline ? new Date(deadline).toISOString() : undefined,
        assigneeIds: selected,
        lat: anchor?.lat ?? undefined,
        lng: anchor?.lng ?? undefined,
      });
    },
    onSuccess: () => {
      onCreated();
      reset();
      onClose();
    },
    onError: (err) => setError(apiErrorMessage(err, 'Gagal membuat misi')),
  });

  const candidates = personnel.filter((p) => {
    const q = term.trim().toLowerCase();
    return !q || p.fullName.toLowerCase().includes(q) || (p.unit?.name ?? '').toLowerCase().includes(q);
  });

  return (
    <Modal
      open={open}
      onClose={() => {
        reset();
        onClose();
      }}
      title="Buat Misi Baru"
      subtitle="Personel yang ditugaskan menerima notifikasi seketika."
      width="max-w-2xl"
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
            Buat & Tugaskan
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <label className="label" htmlFor="mission-title">
            Judul misi
          </label>
          <input
            id="mission-title"
            className="field"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Contoh: Patroli sektor utara"
            autoFocus
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label" htmlFor="mission-priority">
              Prioritas
            </label>
            <select
              id="mission-priority"
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
            <label className="label" htmlFor="mission-deadline">
              Tenggat
            </label>
            <input
              id="mission-deadline"
              type="datetime-local"
              className="field"
              value={deadline}
              onChange={(e) => setDeadline(e.target.value)}
            />
          </div>
        </div>

        <div>
          <label className="label" htmlFor="mission-description">
            Deskripsi
          </label>
          <textarea
            id="mission-description"
            className="field min-h-[88px] resize-y"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Instruksi pelaksanaan misi…"
          />
        </div>

        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <span className="label mb-0">Personel ({selected.length} dipilih)</span>
            <input
              className="field h-8 w-40 text-xs"
              value={term}
              onChange={(e) => setTerm(e.target.value)}
              placeholder="Cari personel…"
              aria-label="Cari personel"
            />
          </div>

          <div className="max-h-52 overflow-y-auto rounded-xl border border-line">
            {candidates.length === 0 ? (
              <p className="p-4 text-center text-sm text-ink-muted">Tidak ada personel cocok.</p>
            ) : (
              candidates.map((p) => (
                <label
                  key={p.id}
                  className="flex cursor-pointer items-center gap-3 border-b border-line px-3 py-2 last:border-b-0 hover:bg-accent-soft"
                >
                  <input
                    type="checkbox"
                    checked={selected.includes(p.id)}
                    onChange={(e) =>
                      setSelected((prev) =>
                        e.target.checked ? [...prev, p.id] : prev.filter((id) => id !== p.id)
                      )
                    }
                    className="h-4 w-4 rounded border-line-strong text-accent focus:ring-accent/30"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-ink">{p.fullName}</span>
                    <span className="block truncate text-xs text-ink-muted">
                      {p.unit?.name ?? 'Tanpa unit'} · {p.status}
                    </span>
                  </span>
                </label>
              ))
            )}
          </div>
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

/* -------------------------------------------------------------- Edit ------ */

function EditMissionModal({
  mission,
  onClose,
  onSaved,
}: {
  mission: Mission | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<Priority>('medium');
  const [status, setStatus] = useState<Mission['status']>('pending');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!mission) return;
    setTitle(mission.title);
    setDescription(mission.description ?? '');
    setPriority(mission.priority);
    setStatus(mission.status);
    setError(null);
  }, [mission]);

  const save = useMutation({
    mutationFn: () =>
      api.patch(`/missions/${mission!.id}`, {
        title: title.trim(),
        description: description.trim(),
        priority,
        status,
      }),
    onSuccess: () => {
      onSaved();
      onClose();
    },
    onError: (err) => setError(apiErrorMessage(err, 'Gagal menyimpan perubahan')),
  });

  return (
    <Modal
      open={mission != null}
      onClose={onClose}
      title="Ubah Misi"
      subtitle={mission ? `Misi #${mission.id}` : ''}
      footer={
        <>
          <button type="button" className="btn-secondary btn-md" onClick={onClose}>
            Batal
          </button>
          <button
            type="button"
            className="btn-primary btn-md"
            onClick={() => save.mutate()}
            disabled={!title.trim() || save.isPending}
          >
            {save.isPending ? <Spinner size={16} /> : <Pencil size={16} />}
            Simpan
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <label className="label" htmlFor="edit-title">
            Judul
          </label>
          <input
            id="edit-title"
            className="field"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label" htmlFor="edit-priority">
              Prioritas
            </label>
            <select
              id="edit-priority"
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
            <label className="label" htmlFor="edit-status">
              Status
            </label>
            <select
              id="edit-status"
              className="field"
              value={status}
              onChange={(e) => setStatus(e.target.value as Mission['status'])}
            >
              {(['pending', 'running', 'completed', 'cancelled'] as Mission['status'][]).map((s) => (
                <option key={s} value={s}>
                  {MISSION_STATUS_LABEL[s]}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className="label" htmlFor="edit-description">
            Deskripsi
          </label>
          <textarea
            id="edit-description"
            className="field min-h-[88px] resize-y"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>

        {error && <p className="text-sm text-danger-strong">{error}</p>}
      </div>
    </Modal>
  );
}
