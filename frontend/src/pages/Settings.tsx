import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  Building2,
  ClipboardList,
  Cog,
  Radar,
  ShieldCheck,
  Users,
} from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import AuditPanel from '../components/settings/AuditPanel';
import OperationsPanel from '../components/settings/OperationsPanel';
import UnitsPanel from '../components/settings/UnitsPanel';
import UsersPanel from '../components/settings/UsersPanel';
import { api } from '../lib/api';
import { cx } from '../lib/format';

interface Overview {
  counts: { personnel: number; command: number; units: number; operations: number };
  policy: {
    idleAfterSeconds: number;
    offlineAfterSeconds: number;
    lowBatteryThreshold: number;
    storage: string;
    streaming: string;
  };
}

type TabKey = 'operations' | 'units' | 'users' | 'audit';

const TABS: Array<{ key: TabKey; label: string; icon: typeof Radar }> = [
  { key: 'operations', label: 'Operasi', icon: Radar },
  { key: 'units', label: 'Unit', icon: Building2 },
  { key: 'users', label: 'Pengguna', icon: Users },
  { key: 'audit', label: 'Audit Log', icon: ClipboardList },
];

export default function Settings() {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<TabKey>('operations');


  const overview = useQuery({
    queryKey: ['settings-overview'],
    queryFn: async () => {
      const { data } = await api.get<Overview>('/settings');
      return data;
    },
  });

  const refreshOverview = () =>
    queryClient.invalidateQueries({ queryKey: ['settings-overview'] });

  const policy = overview.data?.policy;

  return (
    <div className="min-h-screen bg-canvas">
      <header className="sticky top-0 z-30 border-b border-line bg-canvas-raised/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-3 px-4 lg:px-6">
          <Link
            to="/dashboard"
            className="grid h-9 w-9 place-items-center rounded-lg border border-line text-ink-soft transition-colors hover:bg-canvas-sunken"
            aria-label="Kembali ke dashboard"
          >
            <ArrowLeft size={18} />
          </Link>
          <div className="min-w-0 flex-1">
            <h1 className="flex items-center gap-2 text-sm font-semibold text-ink">
              <Cog size={16} className="text-accent" />
              Pengaturan Sistem
            </h1>
            <p className="truncate text-xs text-ink-muted">
              Operasi, unit, pengguna, dan jejak audit
            </p>
          </div>
          <span className="chip bg-accent-soft text-accent-strong">
            <ShieldCheck size={12} />
            Super User
          </span>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-4 px-4 py-5 lg:px-6">
        {/* Runtime policy — configured via environment, shown read-only. */}
        <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {[
            { label: 'Personel', value: overview.data?.counts.personnel ?? '—' },
            { label: 'Staf Komando', value: overview.data?.counts.command ?? '—' },
            { label: 'Unit', value: overview.data?.counts.units ?? '—' },
            { label: 'Operasi Aktif', value: overview.data?.counts.operations ?? '—' },
          ].map((tile) => (
            <article key={tile.label} className="card p-4">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-muted">
                {tile.label}
              </p>
              <p className="mt-2 text-2xl font-bold tabular-nums text-ink">{tile.value}</p>
            </article>
          ))}
        </section>

        {policy && (
          <section className="card p-4">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
              Kebijakan Runtime
            </h2>
            <p className="mt-1 text-xs text-ink-faint">
              Nilai berikut diatur melalui variabel lingkungan dan ditampilkan agar dapat
              diverifikasi tanpa akses server.
            </p>
            <dl className="mt-3 grid grid-cols-2 gap-3 text-sm md:grid-cols-5">
              {[
                ['Ambang idle', `${policy.idleAfterSeconds}s`],
                ['Ambang offline', `${policy.offlineAfterSeconds}s`],
                ['Baterai lemah', `${policy.lowBatteryThreshold}%`],
                ['Penyimpanan', policy.storage === 'minio' ? 'MinIO' : 'Disk lokal'],
                ['Streaming', policy.streaming === 'livekit' ? 'LiveKit' : 'Pratinjau'],
              ].map(([label, value]) => (
                <div key={label} className="rounded-lg border border-line bg-canvas px-3 py-2">
                  <dt className="text-[11px] text-ink-muted">{label}</dt>
                  <dd className="mt-0.5 font-semibold text-ink">{value}</dd>
                </div>
              ))}
            </dl>
          </section>
        )}

        {/* Tabs */}
        <div className="flex flex-wrap gap-1 rounded-xl border border-line bg-canvas-raised p-1">
          {TABS.map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => setTab(item.key)}
              className={cx(
                'flex flex-1 items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                tab === item.key
                  ? 'bg-accent text-white'
                  : 'text-ink-muted hover:bg-canvas-sunken hover:text-ink-soft'
              )}
            >
              <item.icon size={15} />
              {item.label}
            </button>
          ))}
        </div>

        {tab === 'operations' && <OperationsPanel canEdit onChanged={refreshOverview} />}
        {tab === 'units' && <UnitsPanel canEdit onChanged={refreshOverview} />}
        {tab === 'users' && <UsersPanel onChanged={refreshOverview} />}
        {tab === 'audit' && <AuditPanel />}
      </main>
    </div>
  );
}
