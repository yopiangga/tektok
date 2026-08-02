import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, Plus, Power, Radar, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { api, apiErrorMessage } from '../../lib/api';
import { cx, formatDateTime } from '../../lib/format';
import type { Operation } from '../../lib/types';
import { EmptyState, Modal, PanelLoading, Spinner } from '../ui/Primitives';

export default function OperationsPanel({
  canEdit,
  onChanged,
}: {
  canEdit: boolean;
  onChanged: () => void;
}) {
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [deleteFor, setDeleteFor] = useState<Operation | null>(null);

  const operations = useQuery({
    queryKey: ['settings-operations'],
    queryFn: async () => {
      const { data } = await api.get<{ operations: Operation[] }>('/settings/operations');
      return data.operations;
    },
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['settings-operations'] });
    void queryClient.invalidateQueries({ queryKey: ['operation'] });
    onChanged();
  };

  const close = useMutation({
    mutationFn: (id: number) => api.patch(`/settings/operations/${id}`, { status: 'closed' }),
    onSuccess: invalidate,
  });

  const activate = useMutation({
    mutationFn: (id: number) => api.post(`/settings/operations/${id}/activate`),
    onSuccess: invalidate,
  });

  return (
    <section className="card overflow-hidden">
      <header className="card-header">
        <h2 className="card-title">
          <Radar size={16} className="text-accent" />
          Operasi
        </h2>
        {canEdit && (
          <button type="button" className="btn-primary btn-sm" onClick={() => setCreateOpen(true)}>
            <Plus size={14} />
            Operasi Baru
          </button>
        )}
      </header>

      {operations.isLoading ? (
        <PanelLoading />
      ) : (operations.data?.length ?? 0) === 0 ? (
        <EmptyState icon={<Radar size={22} />} title="Belum ada operasi" />
      ) : (
        <ul className="divide-y divide-line">
          {operations.data!.map((operation) => (
            <li key={operation.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-2 font-medium text-ink">
                  {operation.name}
                  <span
                    className={cx(
                      'chip',
                      operation.status === 'active'
                        ? 'bg-success-soft text-success-strong'
                        : 'bg-canvas-sunken text-ink-muted'
                    )}
                  >
                    {operation.status === 'active' ? 'Aktif' : 'Ditutup'}
                  </span>
                </p>
                <p className="mt-0.5 truncate text-xs text-ink-muted">
                  <span className="font-mono">{operation.code}</span> ·{' '}
                  {formatDateTime(operation.startedAt)} ·{' '}
                  <span className="font-mono">
                    {operation.center.lat.toFixed(4)}, {operation.center.lng.toFixed(4)}
                  </span>
                </p>
              </div>

              {canEdit && (
                <div className="flex shrink-0 items-center gap-2">
                  {operation.status === 'active' ? (
                    <button
                      type="button"
                      className="btn-secondary btn-sm"
                      onClick={() => close.mutate(operation.id)}
                      disabled={close.isPending}
                    >
                      <CheckCircle2 size={14} />
                      Tutup
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="btn-primary btn-sm"
                      onClick={() => activate.mutate(operation.id)}
                      disabled={activate.isPending}
                      title="Jadikan operasi ini yang aktif"
                    >
                      {activate.isPending ? <Spinner size={14} /> : <Power size={14} />}
                      Aktifkan
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => setDeleteFor(operation)}
                    className="grid h-8 w-8 place-items-center rounded-md text-ink-muted transition-colors hover:bg-danger-soft hover:text-danger"
                    title="Hapus operasi"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      <DeleteOperationModal
        operation={deleteFor}
        onClose={() => setDeleteFor(null)}
        onDeleted={invalidate}
      />

      <CreateOperationModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={invalidate}
      />
    </section>
  );
}

function CreateOperationModal({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [description, setDescription] = useState('');
  const [lat, setLat] = useState('-6.2088');
  const [lng, setLng] = useState('106.8456');
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setName('');
    setCode('');
    setDescription('');
    setLat('-6.2088');
    setLng('106.8456');
    setError(null);
  };

  const create = useMutation({
    mutationFn: () =>
      api.post('/settings/operations', {
        name: name.trim(),
        code: code.trim().toUpperCase(),
        description: description.trim() || undefined,
        centerLat: Number(lat),
        centerLng: Number(lng),
      }),
    onSuccess: () => {
      onCreated();
      reset();
      onClose();
    },
    onError: (err) => setError(apiErrorMessage(err, 'Gagal membuat operasi')),
  });

  const valid = name.trim() && code.trim() && Number.isFinite(Number(lat)) && Number.isFinite(Number(lng));

  return (
    <Modal
      open={open}
      onClose={() => {
        reset();
        onClose();
      }}
      title="Operasi Baru"
      subtitle="Titik pusat menentukan tampilan awal peta komando."
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
            disabled={!valid || create.isPending}
          >
            {create.isPending ? <Spinner size={16} /> : <Plus size={16} />}
            Buat Operasi
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label" htmlFor="op-name">
              Nama operasi
            </label>
            <input
              id="op-name"
              className="field"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Operasi Aman Nusantara"
              autoFocus
            />
          </div>
          <div>
            <label className="label" htmlFor="op-code">
              Kode
            </label>
            <input
              id="op-code"
              className="field font-mono uppercase"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="OPS-2026-02"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label" htmlFor="op-lat">
              Latitude pusat
            </label>
            <input
              id="op-lat"
              className="field font-mono"
              value={lat}
              onChange={(e) => setLat(e.target.value)}
              inputMode="decimal"
            />
          </div>
          <div>
            <label className="label" htmlFor="op-lng">
              Longitude pusat
            </label>
            <input
              id="op-lng"
              className="field font-mono"
              value={lng}
              onChange={(e) => setLng(e.target.value)}
              inputMode="decimal"
            />
          </div>
        </div>

        <div>
          <label className="label" htmlFor="op-desc">
            Deskripsi
          </label>
          <textarea
            id="op-desc"
            className="field min-h-[88px] resize-y"
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

/* ------------------------------------------------------------- delete ----- */

interface OperationImpact {
  name: string;
  isActive: boolean;
  counts: { reports: number; missions: number; incidents: number };
  total: number;
}

/**
 * Unlike users, the operation foreign keys are ON DELETE SET NULL — records are
 * detached, not destroyed. The dialog says so explicitly so the decision is made
 * on what actually happens rather than on a worst-case assumption.
 */
function DeleteOperationModal({
  operation,
  onClose,
  onDeleted,
}: {
  operation: Operation | null;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const [error, setError] = useState<string | null>(null);

  const impact = useQuery({
    queryKey: ['operation-impact', operation?.id],
    enabled: operation != null,
    queryFn: async () => {
      const { data } = await api.get<OperationImpact>(
        `/settings/operations/${operation!.id}/impact`
      );
      return data;
    },
  });

  const remove = useMutation({
    mutationFn: () => api.delete(`/settings/operations/${operation!.id}`),
    onSuccess: () => {
      onDeleted();
      onClose();
    },
    onError: (err) => setError(apiErrorMessage(err, 'Gagal menghapus operasi')),
  });

  const isActive = impact.data?.isActive ?? false;
  const counts = impact.data?.counts;

  return (
    <Modal
      open={operation != null}
      onClose={() => {
        setError(null);
        onClose();
      }}
      title="Hapus operasi?"
      subtitle={operation ? `${operation.name} · ${operation.code}` : ''}
      footer={
        <>
          <button
            type="button"
            className="btn-secondary btn-md"
            onClick={() => {
              setError(null);
              onClose();
            }}
          >
            Batal
          </button>
          {!impact.isLoading && !isActive && (
            <button
              type="button"
              className="btn-danger btn-md"
              onClick={() => remove.mutate()}
              disabled={remove.isPending}
            >
              {remove.isPending ? <Spinner size={16} /> : <Trash2 size={16} />}
              Hapus operasi
            </button>
          )}
        </>
      }
    >
      {impact.isLoading ? (
        <PanelLoading label="Memeriksa keterkaitan…" />
      ) : isActive ? (
        <p className="rounded-lg border border-warning/30 bg-warning-soft px-3 py-2.5 text-sm text-warning-strong">
          Operasi ini sedang <strong>aktif</strong>. Aktifkan operasi lain terlebih dahulu — laporan
          dan misi baru selalu menempel pada operasi yang aktif, jadi menghapusnya sekarang akan
          membuat catatan baru tidak punya operasi.
        </p>
      ) : (
        <div className="space-y-4">
          <p className="text-sm text-ink-soft">
            Catatan berikut <strong className="text-ink">tidak ikut terhapus</strong> — hanya
            kaitannya ke operasi ini yang dilepas:
          </p>

          <ul className="grid grid-cols-3 gap-2">
            {[
              ['Laporan', counts?.reports ?? 0],
              ['Misi', counts?.missions ?? 0],
              ['Insiden', counts?.incidents ?? 0],
            ].map(([label, value]) => (
              <li key={String(label)} className="rounded-lg border border-line bg-canvas px-3 py-2">
                <p className="text-xs text-ink-muted">{label}</p>
                <p className="mt-0.5 text-lg font-bold tabular-nums text-ink">{value}</p>
              </li>
            ))}
          </ul>

          <p className="text-xs text-ink-muted">
            Penghapusan operasi sendiri tidak dapat dibatalkan dan tercatat di audit log.
          </p>
        </div>
      )}

      {error && <p className="mt-3 text-sm text-danger-strong">{error}</p>}
    </Modal>
  );
}
