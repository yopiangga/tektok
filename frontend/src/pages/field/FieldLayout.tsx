import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Home,
  MapPin,
  MessageSquare,
  Target,
  User,
  Video,
  WifiOff,
} from 'lucide-react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useSocketEvent, useSocketStatus } from '../../hooks/useSocketEvent';
import { useGpsTracking } from '../../hooks/useGpsTracking';
import { api } from '../../lib/api';
import { batteryTone, cx } from '../../lib/format';
import type { AppNotification } from '../../lib/types';
import { useAuth } from '../../store/auth';

/** Four tabs plus an emphasised centre action, mirroring a short-video app. */
const LEFT_TABS = [
  { to: '/app', label: 'Beranda', icon: Home, end: true },
  { to: '/app/mission', label: 'Misi', icon: Target, end: false },
];

const RIGHT_TABS = [
  { to: '/app/chat', label: 'Pesan', icon: MessageSquare, end: false },
  { to: '/app/profile', label: 'Profil', icon: User, end: false },
];

export default function FieldLayout() {
  const { user } = useAuth();
  const location = useLocation();
  const queryClient = useQueryClient();
  const socketStatus = useSocketStatus();
  const gps = useGpsTracking(true);

  const notifications = useQuery({
    queryKey: ['my-notifications'],
    queryFn: async () => {
      const { data } = await api.get<{ notifications: AppNotification[]; unread: number }>(
        '/notifications',
        { params: { limit: 30 } }
      );
      return data;
    },
  });

  useSocketEvent<AppNotification>('notification', (item) => {
    queryClient.setQueryData<{ notifications: AppNotification[]; unread: number }>(
      ['my-notifications'],
      (prev) =>
        prev
          ? { notifications: [item, ...prev.notifications].slice(0, 40), unread: prev.unread + 1 }
          : { notifications: [item], unread: 1 }
    );
    void queryClient.invalidateQueries({ queryKey: ['my-missions'] });
  });

  const unread = notifications.data?.unread ?? 0;
  const online = socketStatus === 'connected';
  const onStream = location.pathname.startsWith('/app/stream');

  return (
    <div className="relative flex h-dvh flex-col overflow-hidden bg-night text-white">
      {/* Floating status strip — overlays content instead of consuming height,
          so every screen stays genuinely full-bleed. Hidden while streaming,
          where the camera screen supplies its own top chrome. */}
      <header
        className={cx(
          'pointer-events-none absolute inset-x-0 top-0 z-30 px-4 pt-[max(0.75rem,env(safe-area-inset-top))]',
          onStream && 'hidden'
        )}
      >
        <div className="mx-auto flex max-w-lg items-center justify-between gap-2">
          <span className="glass-chip">
            <span
              className={cx(
                'h-1.5 w-1.5 rounded-full',
                gps.permission === 'granted' ? 'animate-pulse bg-success' : 'bg-warning'
              )}
            />
            {user?.unitName ?? 'Tanpa unit'}
          </span>

          <div className="flex items-center gap-1.5">
            <span className="glass-chip" title={gps.error ?? 'GPS aktif'}>
              <MapPin size={11} />
              {gps.permission === 'granted' ? (gps.precise ? 'GPS' : 'GPS~') : 'GPS ✕'}
            </span>
            {gps.battery != null && (
              <span className={cx('glass-chip', batteryTone(gps.battery))}>{gps.battery}%</span>
            )}
            {!online && (
              <span className="glass-chip text-danger">
                <WifiOff size={11} />
              </span>
            )}
          </div>
        </div>
      </header>

      {gps.error && (
        <p className="pointer-events-none absolute inset-x-3 top-14 z-30 rounded-xl bg-warning/90 px-3 py-2 text-center text-[11px] font-medium text-ink">
          {gps.error}
        </p>
      )}

      <main className="min-h-0 flex-1">
        <Outlet context={{ gps }} />
      </main>

      {/* Bottom bar — hidden while streaming so the camera owns the screen. */}
      {!onStream && (
        <nav className="relative z-30 shrink-0 border-t border-night-line bg-night pb-[env(safe-area-inset-bottom)]">
          <div className="mx-auto flex max-w-lg items-center">
            {LEFT_TABS.map((tab) => (
              <Tab key={tab.to} {...tab} pathname={location.pathname} />
            ))}

            {/* Centre action: the primary thing a field officer does. */}
            <NavLink
              to="/app/stream"
              className="flex flex-1 items-center justify-center py-2"
              aria-label="Mulai siaran langsung"
            >
              <span className="relative grid h-9 w-14 place-items-center rounded-lg bg-live shadow-[0_0_0_2px_rgba(37,244,238,0.5)]">
                <Video size={20} className="text-white" />
              </span>
            </NavLink>

            <Tab {...RIGHT_TABS[0]} pathname={location.pathname} badge={unread} />
            <Tab {...RIGHT_TABS[1]} pathname={location.pathname} />
          </div>
        </nav>
      )}
    </div>
  );
}

function Tab({
  to,
  label,
  icon: Icon,
  end,
  pathname,
  badge = 0,
}: {
  to: string;
  label: string;
  icon: typeof Home;
  end: boolean;
  pathname: string;
  badge?: number;
}) {
  const active = end ? pathname === to : pathname.startsWith(to);

  return (
    <NavLink
      to={to}
      end={end}
      className={cx(
        'relative flex flex-1 flex-col items-center gap-0.5 py-2 text-[10px] font-semibold transition-colors',
        active ? 'text-white' : 'text-white/45'
      )}
    >
      <Icon size={20} strokeWidth={active ? 2.4 : 2} />
      {label}
      {badge > 0 && (
        <span className="absolute right-1/2 top-1 translate-x-3 rounded-full bg-live px-1 text-[9px] font-bold text-white">
          {badge > 9 ? '9+' : badge}
        </span>
      )}
    </NavLink>
  );
}
