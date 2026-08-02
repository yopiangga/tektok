import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Building2, Pencil, Plus, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { api, apiErrorMessage } from '../../lib/api';
import { EmptyState, Modal, PanelLoading, Spinner } from '../ui/Primitives';

interface UnitRow {
  id: number;
  code: string;
  name: string;
  color: string;
  members: number;
}

export default function UnitsPanel({
  canEdit,
  onChanged,
}: {
  canEdit: boolean;
  onChanged: () => void;
}) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<UnitRow | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<UnitRow | null>(null);

  const units = useQuery({
    queryKey: ['settings-units'],
    queryFn: async () => {
      const { data } = await api.get<{ units: UnitRow[] }>('/settings/units');
      return data.units;
    },
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['settings-units'] });
    void queryClient.invalidateQueries({ queryKey: ['units'] });
    onChanged();
  };

  const remove = useMutation({
    mutationFn: (id: number) => api.delete(`/settings/units/${id}`),
    onSuccess: () => {
      invalidate();
      setConfirmDelete(null);
    },
  });

  return (
    <section className="card overflow-hidden">
      <header className="card-header">
        <h2 className="card-title">
          <Building2 size={16} className="text-accent" />
          Unit
        </h2>
        {canEdit && (
          <button type="button" className="btn-primary btn-sm" onClick={() => setCreateOpen(true)}>
            <Plus size={14} />
            Unit Baru
          </button>
        )}
      </header>

      {units.isLoading ? (
        <PanelLoading />
      ) : (units.data?.length ?? 0) === 0 ? (
        <EmptyState icon={<Building2 size={22} />} title="Belum ada unit" />
      ) : (
        <ul className="divide-y divide-line">
          {units.data!.map((unit) => (
            <li key={unit.id} className="flex items-center gap-3 px-4 py-3">
              <span
                className="h-8 w-8 shrink-0 rounded-lg"
                style={{ backgroundColor: unit.color }}
                aria-hidden
              />
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium text-ink">{unit.name}</p>
                <p className="truncate text-xs text-ink-muted">
                  <span className="font-mono">{unit.code}</span> · {unit.members} personel
                </p>
              </div>

              {canEdit && (
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setEditing(unit)}
                    className="grid h-8 w-8 place-items-center rounded-md text-ink-muted transition-colors hover:bg-accent-soft hover:text-accent"
                    title="Ubah unit"
                  >
                    <Pencil size={15} />
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmDelete(unit)}
                    className="grid h-8 w-8 place-items-center rounded-md text-ink-muted transition-colors hover:bg-danger-soft hover:text-danger"
                    title="Hapus unit"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      <UnitFormModal
        open={createOpen || editing != null}
        unit={editing}
        onClose={() => {
          setCreateOpen(false);
          setEditing(null);
        }}
        onSaved={invalidate}
      />

      <Modal
        open={confirmDelete != null}
        onClose={() => setConfirmDelete(null)}
        title="Hapus unit?"
        subtitle={confirmDelete?.name}
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
          {confirmDelete?.members ? (
            <>
              <strong className="text-ink">{confirmDelete.members} personel</strong> akan dilepas
              dari unit ini. Akun personel tidak dihapus dan tetap dapat digunakan — mereka hanya
              menjadi tanpa unit sampai ditugaskan kembali.
            </>
          ) : (
            'Unit ini tidak memiliki anggota. Tindakan ini tidak dapat dibatalkan.'
          )}
        </p>
      </Modal>
    </section>
  );
}

function UnitFormModal({
  open,
  unit,
  onClose,
  onSaved,
}: {
  open: boolean;
  unit: UnitRow | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [color, setColor] = useState('#2563EB');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setCode(unit?.code ?? '');
    setName(unit?.name ?? '');
    setColor(unit?.color ?? '#2563EB');
    setError(null);
  }, [open, unit]);

  const save = useMutation({
    mutationFn: () => {
      const payload = { code: code.trim().toUpperCase(), name: name.trim(), color };
      return unit
        ? api.patch(`/settings/units/${unit.id}`, payload)
        : api.post('/settings/units', payload);
    },
    onSuccess: () => {
      onSaved();
      onClose();
    },
    onError: (err) => setError(apiErrorMessage(err, 'Gagal menyimpan unit')),
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={unit ? 'Ubah Unit' : 'Unit Baru'}
      footer={
        <>
          <button type="button" className="btn-secondary btn-md" onClick={onClose}>
            Batal
          </button>
          <button
            type="button"
            className="btn-primary btn-md"
            onClick={() => save.mutate()}
            disabled={!code.trim() || !name.trim() || save.isPending}
          >
            {save.isPending ? <Spinner size={16} /> : <Plus size={16} />}
            Simpan
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label" htmlFor="unit-code">
              Kode
            </label>
            <input
              id="unit-code"
              className="field font-mono uppercase"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="GOLF"
              autoFocus
            />
          </div>
          <div>
            <label className="label" htmlFor="unit-color">
              Warna penanda
            </label>
            <div className="flex items-center gap-2">
              <input
                id="unit-color"
                type="color"
                className="h-10 w-12 shrink-0 cursor-pointer rounded-lg border border-line bg-canvas-raised p-1"
                value={color}
                onChange={(e) => setColor(e.target.value)}
              />
              <input
                className="field font-mono"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                aria-label="Kode warna heksadesimal"
              />
            </div>
          </div>
        </div>

        <div>
          <label className="label" htmlFor="unit-name">
            Nama unit
          </label>
          <input
            id="unit-name"
            className="field"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Unit Golf"
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
