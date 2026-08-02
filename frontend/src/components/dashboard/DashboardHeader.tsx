import { ChevronDown, Cog, LogOut, Radio, ShieldCheck, Wifi, WifiOff } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useNow, useSocketStatus } from '../../hooks/useSocketEvent';
import { BRAND, BRAND_TAGLINE } from '../../lib/brand';
import { cx } from '../../lib/format';
import type { Operation } from '../../lib/types';
import { useAuth } from '../../store/auth';
import { Avatar } from '../ui/Primitives';
import GlobalSearch from './GlobalSearch';

const ROLE_LABEL: Record<string, string> = {
  superuser: 'Super User',
  personnel: 'Personel',
  drone: 'Drone',
  screen: 'Share Screen',
};

export default function DashboardHeader({ operation }: { operation?: Operation | null }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const now = useNow();
  const socketStatus = useSocketStatus();

  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const onClick = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [menuOpen]);

  const online = socketStatus === 'connected';

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-canvas-raised/90 backdrop-blur">
      <div className="flex h-16 items-center gap-3 px-4 lg:gap-5 lg:px-6">
        {/* Identity */}
        <div className="flex shrink-0 items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-accent text-white shadow-soft">
            <ShieldCheck size={20} />
          </div>
          {/*
            Brand di baris pertama dan selalu tampil — termasuk di layar sempit,
            di mana sebelumnya seluruh blok ini disembunyikan sehingga dashboard
            tidak menampilkan nama sistem sama sekali. Operasi aktif turun ke
            baris kedua sebagai konteks.
          */}
          <div className="min-w-0">
            <p className="truncate text-sm font-bold leading-tight tracking-[0.18em] text-ink">
              {BRAND}
            </p>
            <p className="hidden truncate text-xs text-ink-muted sm:block">
              {operation ? `${operation.code} · ${operation.name}` : BRAND_TAGLINE}
            </p>
          </div>
        </div>

        <div className="min-w-0 flex-1 px-1 lg:px-4">
          <GlobalSearch />
        </div>

        {/* System status */}
        <div
          className={cx(
            'hidden items-center gap-2 rounded-lg border px-3 py-1.5 md:flex',
            online
              ? 'border-success/25 bg-success-soft text-success-strong'
              : 'border-danger/25 bg-danger-soft text-danger-strong'
          )}
          title={online ? 'Terhubung ke server realtime' : 'Koneksi realtime terputus'}
        >
          {online ? <Wifi size={15} /> : <WifiOff size={15} />}
          <span className="text-xs font-semibold">{online ? 'SISTEM AKTIF' : 'TERPUTUS'}</span>
        </div>

        {/* Clock */}
        <div className="hidden shrink-0 text-right lg:block">
          <p className="font-mono text-lg font-semibold leading-none tabular-nums text-ink">
            {now.toLocaleTimeString('id-ID', { hour12: false })}
          </p>
          <p className="mt-1 text-[11px] text-ink-muted">
            {now.toLocaleDateString('id-ID', {
              weekday: 'long',
              day: 'numeric',
              month: 'long',
              year: 'numeric',
            })}
          </p>
        </div>

        {/* User menu */}
        <div className="relative shrink-0" ref={menuRef}>
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            className="flex items-center gap-2 rounded-lg border border-line px-2 py-1.5 transition-colors hover:bg-canvas-sunken"
            aria-expanded={menuOpen}
            aria-haspopup="menu"
          >
            <Avatar name={user?.fullName ?? 'User'} size={30} />
            <span className="hidden text-left sm:block">
              <span className="block max-w-[9rem] truncate text-xs font-semibold text-ink">
                {user?.fullName}
              </span>
              <span className="block text-[11px] text-ink-muted">
                {ROLE_LABEL[user?.role ?? ''] ?? user?.role}
              </span>
            </span>
            <ChevronDown size={15} className="text-ink-faint" />
          </button>

          {menuOpen && (
            <div
              role="menu"
              className="absolute right-0 top-[calc(100%+8px)] w-60 overflow-hidden rounded-xl border border-line bg-canvas-raised shadow-lift animate-slide-up"
            >
              <div className="border-b border-line px-4 py-3">
                <p className="truncate text-sm font-semibold text-ink">{user?.fullName}</p>
                <p className="truncate text-xs text-ink-muted">
                  @{user?.username} · {ROLE_LABEL[user?.role ?? '']}
                </p>
              </div>
              <div className="flex items-center gap-2 px-4 py-2.5 text-xs text-ink-muted">
                <Radio size={14} className={online ? 'text-success' : 'text-danger'} />
                Realtime {online ? 'tersambung' : 'terputus'}
              </div>
              <Link
                to="/settings"
                role="menuitem"
                onClick={() => setMenuOpen(false)}
                className="flex w-full items-center gap-2 border-t border-line px-4 py-3 text-sm font-medium text-ink-soft transition-colors hover:bg-canvas-sunken"
              >
                <Cog size={16} />
                Pengaturan sistem
              </Link>
              <button
                type="button"
                role="menuitem"
                onClick={async () => {
                  await logout();
                  navigate('/login', { replace: true });
                }}
                className="flex w-full items-center gap-2 border-t border-line px-4 py-3 text-sm font-medium text-danger-strong transition-colors hover:bg-danger-soft"
              >
                <LogOut size={16} />
                Keluar dari sistem
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
