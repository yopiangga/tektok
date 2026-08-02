import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { KeyRound, Plus, Search, Trash2, UserCheck, UserX, Users } from 'lucide-react';
import { useEffect, useState } from 'react';
import { api, apiErrorMessage } from '../../lib/api';
import { cx, formatDateTime } from '../../lib/format';
import type { RoleCode } from '../../lib/types';
import { useAuth } from '../../store/auth';
import { Avatar, EmptyState, Modal, PanelLoading, Spinner } from '../ui/Primitives';

interface UserRow {
  id: number;
  username: string;
  fullName: string;
  phone: string | null;
  badgeNumber: string | null;
  isActive: boolean;
  status: string;
  role: RoleCode;
  unit: { id: number; name: string } | null;
  createdAt: string;
}

interface UnitOption {
  id: number;
  code: string;
  name: string;
}

const ROLE_LABEL: Record<RoleCode, string> = {
  superuser: 'Super User',
  personnel: 'Personel',
  drone: 'Drone',
  screen: 'Share Screen',
};

const ROLE_CHIP: Record<RoleCode, string> = {
  superuser: 'bg-accent-soft text-accent-strong',
  personnel: 'bg-canvas-sunken text-ink-muted',
  drone: 'bg-warning-soft text-warning-strong',
  screen: 'bg-success-soft text-success-strong',
};

export default function UsersPanel({ onChanged }: { onChanged: () => void }) {
  const { user: currentUser } = useAuth();
  const queryClient = useQueryClient();

  const [role, setRole] = useState<RoleCode | 'all'>('all');
  const [term, setTerm] = useState('');
  const [debounced, setDebounced] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [resetFor, setResetFor] = useState<UserRow | null>(null);
  const [deleteFor, setDeleteFor] = useState<UserRow | null>(null);

  useEffect(() => {
    const id = setTimeout(() => setDebounced(term.trim()), 250);
    return () => clearTimeout(id);
  }, [term]);

  const users = useQuery({
    queryKey: ['settings-users', role, debounced],
    queryFn: async () => {
      const { data } = await api.get<{ users: UserRow[] }>('/settings/users', {
        params: { role: role === 'all' ? undefined : role, q: debounced || undefined },
      });
      return data.users;
    },
  });

  const units = useQuery({
    queryKey: ['settings-units'],
    queryFn: async () => {
      const { data } = await api.get<{ units: UnitOption[] }>('/settings/units');
      return data.units;
    },
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['settings-users'] });
    void queryClient.invalidateQueries({ queryKey: ['personnel'] });
    onChanged();
  };

  const toggleActive = useMutation({
    mutationFn: ({ id, isActive }: { id: number; isActive: boolean }) =>
      api.patch(`/settings/users/${id}`, { isActive }),
    onSuccess: invalidate,
  });

  return (
    <section className="card overflow-hidden">
      <header className="card-header">
        <h2 className="card-title">
          <Users size={16} className="text-accent" />
          Pengguna
          <span className="ml-1 rounded-full bg-canvas-sunken px-2 py-0.5 text-[11px] font-medium text-ink-muted">
            {users.data?.length ?? 0}
          </span>
        </h2>
        <button type="button" className="btn-primary btn-sm" onClick={() => setCreateOpen(true)}>
          <Plus size={14} />
          Pengguna Baru
        </button>
      </header>

      <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-3">
        <div className="relative min-w-0 flex-1">
          <Search
            size={15}
            className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-faint"
          />
          <input
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            placeholder="Cari nama, username, atau nomor…"
            className="field h-9 pl-8 text-sm"
            aria-label="Cari pengguna"
          />
        </div>
        <select
          value={role}
          onChange={(e) => setRole(e.target.value as RoleCode | 'all')}
          className="field h-9 w-auto py-0 text-sm"
          aria-label="Filter peran"
        >
          <option value="all">Semua peran</option>
          <option value="superuser">Super User</option>
          <option value="personnel">Personel</option>
          <option value="drone">Drone</option>
          <option value="screen">Share Screen</option>
        </select>
      </div>

      <div className="max-h-[32rem] overflow-y-auto">
        {users.isLoading ? (
          <PanelLoading />
        ) : (users.data?.length ?? 0) === 0 ? (
          <EmptyState icon={<Users size={22} />} title="Tidak ada pengguna cocok" />
        ) : (
          <ul className="divide-y divide-line">
            {users.data!.map((row) => (
              <li key={row.id} className="flex items-center gap-3 px-4 py-3">
                <Avatar name={row.fullName} size={36} />

                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2">
                    <span className="truncate font-medium text-ink">{row.fullName}</span>
                    <span className={cx('chip', ROLE_CHIP[row.role])}>{ROLE_LABEL[row.role]}</span>
                    {!row.isActive && (
                      <span className="chip bg-danger-soft text-danger-strong">Nonaktif</span>
                    )}
                  </p>
                  <p className="mt-0.5 truncate text-xs text-ink-muted">
                    <span className="font-mono">@{row.username}</span>
                    {row.badgeNumber && ` · ${row.badgeNumber}`}
                    {row.unit && ` · ${row.unit.name}`} · dibuat {formatDateTime(row.createdAt)}
                  </p>
                </div>

                <div className="flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setResetFor(row)}
                    className="grid h-8 w-8 place-items-center rounded-md text-ink-muted transition-colors hover:bg-accent-soft hover:text-accent"
                    title="Atur ulang password"
                  >
                    <KeyRound size={15} />
                  </button>
                  <button
                    type="button"
                    onClick={() => toggleActive.mutate({ id: row.id, isActive: !row.isActive })}
                    disabled={row.id === currentUser?.id || toggleActive.isPending}
                    className={cx(
                      'grid h-8 w-8 place-items-center rounded-md transition-colors disabled:opacity-30',
                      row.isActive
                        ? 'text-ink-muted hover:bg-danger-soft hover:text-danger'
                        : 'text-ink-muted hover:bg-success-soft hover:text-success-strong'
                    )}
                    title={
                      row.id === currentUser?.id
                        ? 'Tidak dapat menonaktifkan akun sendiri'
                        : row.isActive
                          ? 'Nonaktifkan akun'
                          : 'Aktifkan akun'
                    }
                  >
                    {row.isActive ? <UserX size={15} /> : <UserCheck size={15} />}
                  </button>

                  <button
                    type="button"
                    onClick={() => setDeleteFor(row)}
                    disabled={row.id === currentUser?.id}
                    className="grid h-8 w-8 place-items-center rounded-md text-ink-muted transition-colors hover:bg-danger-soft hover:text-danger disabled:opacity-30"
                    title={
                      row.id === currentUser?.id
                        ? 'Tidak dapat menghapus akun sendiri'
                        : 'Hapus permanen'
                    }
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <CreateUserModal
        open={createOpen}
        units={units.data ?? []}
        onClose={() => setCreateOpen(false)}
        onCreated={invalidate}
      />

      <ResetPasswordModal user={resetFor} onClose={() => setResetFor(null)} onSaved={invalidate} />

      <DeleteUserModal
        user={deleteFor}
        onClose={() => setDeleteFor(null)}
        onDone={invalidate}
        onDeactivate={(id) => toggleActive.mutate({ id, isActive: false })}
      />
    </section>
  );
}

/* ------------------------------------------------------------- delete ----- */

interface Impact {
  fullName: string;
  counts: { reports: number; missions: number; streams: number; messages: number };
  total: number;
  deletableCleanly: boolean;
}

/**
 * Deleting a user cascades to their reports, mission assignments, streams and
 * messages. The dialog therefore states exactly what would be destroyed and
 * offers deactivation — which removes them from the operation while keeping the
 * record — before allowing a forced delete.
 */
function DeleteUserModal({
  user,
  onClose,
  onDone,
  onDeactivate,
}: {
  user: UserRow | null;
  onClose: () => void;
  onDone: () => void;
  onDeactivate: (id: number) => void;
}) {
  const [error, setError] = useState<string | null>(null);

  const impact = useQuery({
    queryKey: ['user-impact', user?.id],
    enabled: user != null,
    queryFn: async () => {
      const { data } = await api.get<Impact>(`/settings/users/${user!.id}/impact`);
      return data;
    },
  });

  const remove = useMutation({
    mutationFn: (force: boolean) =>
      api.delete(`/settings/users/${user!.id}`, { params: force ? { force: 'true' } : undefined }),
    onSuccess: () => {
      onDone();
      onClose();
    },
    onError: (err) => setError(apiErrorMessage(err, 'Gagal menghapus pengguna')),
  });

  const clean = impact.data?.deletableCleanly ?? false;
  const counts = impact.data?.counts;

  return (
    <Modal
      open={user != null}
      onClose={() => {
        setError(null);
        onClose();
      }}
      title="Hapus pengguna?"
      subtitle={user ? `${user.fullName} · @${user.username}` : ''}
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

          {impact.isLoading ? null : clean ? (
            <button
              type="button"
              className="btn-danger btn-md"
              onClick={() => remove.mutate(false)}
              disabled={remove.isPending}
            >
              {remove.isPending ? <Spinner size={16} /> : <Trash2 size={16} />}
              Hapus permanen
            </button>
          ) : (
            <button
              type="button"
              className="btn-primary btn-md"
              onClick={() => {
                if (user) onDeactivate(user.id);
                onClose();
              }}
            >
              <UserX size={16} />
              Nonaktifkan saja
            </button>
          )}
        </>
      }
    >
      {impact.isLoading ? (
        <PanelLoading label="Memeriksa riwayat…" />
      ) : clean ? (
        <p className="text-sm text-ink-soft">
          Akun ini belum memiliki riwayat operasional, jadi dapat dihapus permanen tanpa kehilangan
          data apa pun. Tindakan ini tidak dapat dibatalkan.
        </p>
      ) : (
        <div className="space-y-4">
          <p className="text-sm text-ink-soft">
            Menghapus <strong className="text-ink">{user?.fullName}</strong> akan{' '}
            <strong className="text-danger-strong">ikut menghapus permanen</strong> seluruh riwayat
            operasionalnya:
          </p>

          <ul className="grid grid-cols-2 gap-2">
            {[
              ['Laporan lapangan', counts?.reports ?? 0],
              ['Penugasan misi', counts?.missions ?? 0],
              ['Riwayat siaran', counts?.streams ?? 0],
              ['Pesan', counts?.messages ?? 0],
            ].map(([label, value]) => (
              <li key={String(label)} className="rounded-lg border border-line bg-canvas px-3 py-2">
                <p className="text-xs text-ink-muted">{label}</p>
                <p className="mt-0.5 text-lg font-bold tabular-nums text-ink">{value}</p>
              </li>
            ))}
          </ul>

          <p className="rounded-lg border border-warning/30 bg-warning-soft px-3 py-2.5 text-sm text-warning-strong">
            Laporan lapangan adalah catatan operasi. Menonaktifkan akun mengeluarkan personel dari
            operasi tanpa menghapus riwayatnya — itu yang disarankan.
          </p>

          <button
            type="button"
            onClick={() => remove.mutate(true)}
            disabled={remove.isPending}
            className="w-full rounded-lg border border-danger/40 px-3 py-2 text-xs font-semibold text-danger-strong transition-colors hover:bg-danger-soft disabled:opacity-50"
          >
            {remove.isPending
              ? 'Menghapus…'
              : `Saya mengerti — hapus permanen beserta ${impact.data?.total ?? 0} catatan`}
          </button>
        </div>
      )}

      {error && <p className="mt-3 text-sm text-danger-strong">{error}</p>}
    </Modal>
  );
}

function CreateUserModal({
  open,
  units,
  onClose,
  onCreated,
}: {
  open: boolean;
  units: UnitOption[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [badgeNumber, setBadgeNumber] = useState('');
  const [role, setRole] = useState<RoleCode>('personnel');
  const [unitId, setUnitId] = useState<string>('');
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setUsername('');
    setPassword('');
    setFullName('');
    setPhone('');
    setBadgeNumber('');
    setRole('personnel');
    setUnitId('');
    setError(null);
  };

  const create = useMutation({
    mutationFn: () =>
      api.post('/settings/users', {
        username: username.trim().toLowerCase(),
        password,
        fullName: fullName.trim(),
        phone: phone.trim() || undefined,
        badgeNumber: badgeNumber.trim() || undefined,
        role,
        unitId: role === 'personnel' && unitId ? Number(unitId) : null,
      }),
    onSuccess: () => {
      onCreated();
      reset();
      onClose();
    },
    onError: (err) => setError(apiErrorMessage(err, 'Gagal membuat pengguna')),
  });

  const valid = username.trim().length >= 3 && password.length >= 8 && fullName.trim();

  return (
    <Modal
      open={open}
      onClose={() => {
        reset();
        onClose();
      }}
      title="Pengguna Baru"
      subtitle="Akun langsung aktif dan dapat digunakan untuk masuk."
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
            Buat Pengguna
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <label className="label" htmlFor="user-fullname">
            Nama lengkap
          </label>
          <input
            id="user-fullname"
            className="field"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            autoFocus
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label" htmlFor="user-username">
              Username
            </label>
            <input
              id="user-username"
              className="field font-mono lowercase"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="p101"
            />
          </div>
          <div>
            <label className="label" htmlFor="user-password">
              Password awal
            </label>
            <input
              id="user-password"
              type="text"
              className="field font-mono"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="minimal 8 karakter"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label" htmlFor="user-role">
              Peran
            </label>
            <select
              id="user-role"
              className="field"
              value={role}
              onChange={(e) => setRole(e.target.value as RoleCode)}
            >
              <option value="personnel">Personel</option>
              <option value="drone">Drone</option>
              <option value="screen">Share Screen</option>
              <option value="superuser">Super User</option>
            </select>
          </div>
          <div>
            <label className="label" htmlFor="user-unit">
              Unit
            </label>
            <select
              id="user-unit"
              className="field"
              value={unitId}
              onChange={(e) => setUnitId(e.target.value)}
              disabled={role === 'superuser'}
            >
              <option value="">— Tanpa unit —</option>
              {units.map((unit) => (
                <option key={unit.id} value={unit.id}>
                  {unit.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label" htmlFor="user-phone">
              Telepon
            </label>
            <input
              id="user-phone"
              className="field"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+62…"
            />
          </div>
          <div>
            <label className="label" htmlFor="user-badge">
              Nomor registrasi
            </label>
            <input
              id="user-badge"
              className="field font-mono"
              value={badgeNumber}
              onChange={(e) => setBadgeNumber(e.target.value)}
              placeholder="P-101"
            />
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

function ResetPasswordModal({
  user,
  onClose,
  onSaved,
}: {
  user: UserRow | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setPassword('');
    setError(null);
  }, [user]);

  const save = useMutation({
    mutationFn: () => api.patch(`/settings/users/${user!.id}`, { password }),
    onSuccess: () => {
      onSaved();
      onClose();
    },
    onError: (err) => setError(apiErrorMessage(err, 'Gagal mengatur ulang password')),
  });

  return (
    <Modal
      open={user != null}
      onClose={onClose}
      title="Atur Ulang Password"
      subtitle={user ? `${user.fullName} · @${user.username}` : ''}
      footer={
        <>
          <button type="button" className="btn-secondary btn-md" onClick={onClose}>
            Batal
          </button>
          <button
            type="button"
            className="btn-primary btn-md"
            onClick={() => save.mutate()}
            disabled={password.length < 8 || save.isPending}
          >
            {save.isPending ? <Spinner size={16} /> : <KeyRound size={16} />}
            Simpan
          </button>
        </>
      }
    >
      <label className="label" htmlFor="reset-password">
        Password baru
      </label>
      <input
        id="reset-password"
        type="text"
        className="field font-mono"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder="minimal 8 karakter"
        autoFocus
      />
      <p className="mt-2 text-xs text-ink-muted">
        Tindakan ini tercatat dalam audit log. Sampaikan password baru melalui kanal resmi.
      </p>
      {error && <p className="mt-3 text-sm text-danger-strong">{error}</p>}
    </Modal>
  );
}
