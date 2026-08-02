import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell, Building2, IdCard, LogOut, Phone, User } from 'lucide-react';
import { useNavigate, useOutletContext } from 'react-router-dom';
import { Avatar, EmptyState, PanelLoading } from '../../components/ui/Primitives';
import type { GpsState } from '../../hooks/useGpsTracking';
import { api } from '../../lib/api';
import { batteryTone, cx, timeAgo } from '../../lib/format';
import type { AppNotification } from '../../lib/types';
import { useAuth } from '../../store/auth';

const SEVERITY_TONE: Record<AppNotification['severity'], string> = {
  info: 'bg-accent-soft text-accent-strong',
  success: 'bg-success-soft text-success-strong',
  warning: 'bg-warning-soft text-warning-strong',
  danger: 'bg-danger-soft text-danger-strong',
};

export default function FieldProfile() {
  const { user, logout } = useAuth();
  const { gps } = useOutletContext<{ gps: GpsState }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

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

  async function markAllRead() {
    await api.post('/notifications/read-all');
    void queryClient.invalidateQueries({ queryKey: ['my-notifications'] });
  }

  return (
    <div className="field-page">
      <section className="rounded-2xl border border-night-line bg-night-raised p-5 text-center">
        <div className="flex justify-center">
          <Avatar name={user?.fullName ?? '—'} src={user?.photoUrl} size={80} />
        </div>
        <h1 className="mt-3 text-xl font-bold text-white">{user?.fullName}</h1>
        <p className="text-sm text-white/55">@{user?.username}</p>

        <dl className="mt-5 divide-y divide-night-line border-t border-night-line text-left text-sm">
          <div className="flex items-center gap-3 py-3">
            <IdCard size={17} className="shrink-0 text-white/40" />
            <dt className="flex-1 text-white/55">Nomor Registrasi</dt>
            <dd className="font-medium text-white">{user?.badgeNumber ?? '—'}</dd>
          </div>
          <div className="flex items-center gap-3 py-3">
            <Building2 size={17} className="shrink-0 text-white/40" />
            <dt className="flex-1 text-white/55">Unit</dt>
            <dd className="font-medium text-white">{user?.unitName ?? '—'}</dd>
          </div>
          <div className="flex items-center gap-3 py-3">
            <Phone size={17} className="shrink-0 text-white/40" />
            <dt className="flex-1 text-white/55">Telepon</dt>
            <dd className="font-medium text-white">{user?.phone ?? '—'}</dd>
          </div>
          <div className="flex items-center gap-3 py-3">
            <User size={17} className="shrink-0 text-white/40" />
            <dt className="flex-1 text-white/55">Baterai perangkat</dt>
            <dd className={cx('font-medium tabular-nums', batteryTone(gps.battery))}>
              {gps.battery != null ? `${gps.battery}%` : '—'}
            </dd>
          </div>
        </dl>
      </section>

      <section className="rounded-2xl border border-night-line bg-night-raised overflow-hidden">
        <header className="card-header">
          <h2 className="card-title">
            <Bell size={16} className="text-warning" />
            Notifikasi
            {(notifications.data?.unread ?? 0) > 0 && (
              <span className="ml-1 rounded-full bg-danger px-2 py-0.5 text-[11px] font-bold text-white">
                {notifications.data!.unread}
              </span>
            )}
          </h2>
          <button
            type="button"
            className="btn-secondary btn-sm"
            onClick={markAllRead}
            disabled={(notifications.data?.unread ?? 0) === 0}
          >
            Tandai dibaca
          </button>
        </header>

        {notifications.isLoading ? (
          <PanelLoading />
        ) : (notifications.data?.notifications.length ?? 0) === 0 ? (
          <EmptyState icon={<Bell size={22} />} title="Tidak ada notifikasi" />
        ) : (
          <ul className="max-h-80 divide-y divide-night-line overflow-y-auto">
            {notifications.data!.notifications.map((item) => (
              <li
                key={item.id}
                className={cx('px-4 py-3', !item.read && 'bg-accent-soft/40')}
              >
                <div className="flex items-baseline justify-between gap-2">
                  <span className={cx('chip', SEVERITY_TONE[item.severity])}>{item.title}</span>
                  <span className="shrink-0 text-[11px] text-white/40">
                    {timeAgo(item.createdAt)}
                  </span>
                </div>
                {item.body && <p className="mt-1.5 text-sm text-white/80">{item.body}</p>}
              </li>
            ))}
          </ul>
        )}
      </section>

      <button
        type="button"
        className="btn-danger h-14 w-full text-base"
        onClick={async () => {
          await logout();
          navigate('/login', { replace: true });
        }}
      >
        <LogOut size={19} />
        KELUAR
      </button>
    </div>
  );
}
