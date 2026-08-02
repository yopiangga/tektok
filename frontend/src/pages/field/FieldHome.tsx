import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CheckCircle2,
  ChevronUp,
  FileText,
  MapPin,
  MessageSquare,
  PlayCircle,
  Radio,
  Target,
  Video,
} from 'lucide-react';
import { Link, useNavigate, useOutletContext } from 'react-router-dom';
import { Spinner } from '../../components/ui/Primitives';
import type { GpsState } from '../../hooks/useGpsTracking';
import { api } from '../../lib/api';
import { PRIORITY_LABEL, cx, formatDateTime, formatTime } from '../../lib/format';
import type { Mission } from '../../lib/types';
import { useAuth } from '../../store/auth';

/**
 * A vertically snapping full-screen feed: status first, then one card per active
 * mission. It borrows the short-video pattern deliberately — a one-handed feed
 * with a right-hand action rail is already muscle memory for the people using
 * this in the field, so the interface needs no training.
 */
export default function FieldHome() {
  const { user } = useAuth();
  const { gps } = useOutletContext<{ gps: GpsState }>();
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const missions = useQuery({
    queryKey: ['my-missions'],
    queryFn: async () => {
      const { data } = await api.get<{ missions: Mission[] }>('/missions', {
        params: { limit: 20 },
      });
      return data.missions;
    },
  });

  const active = (missions.data ?? []).filter(
    (m) => m.status === 'pending' || m.status === 'running',
  );

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['my-missions'] });

  const accept = useMutation({
    mutationFn: (id: number) => api.post(`/missions/${id}/accept`),
    onSuccess: invalidate,
  });
  const complete = useMutation({
    mutationFn: (id: number) => api.post('/missions/complete', { missionId: id }),
    onSuccess: invalidate,
  });

  return (
    // The rail lives outside the scroller as a single fixed overlay: rendering
    // it per card duplicated it on every screen and forced the content to
    // reserve a gutter for it, pushing the status block off centre.
    <div className="relative h-full">
      <div className="feed">
        {/* -------------------------------------------------- status card --- */}
        <section className="feed-card bg-gradient-to-b from-[#0B1220] via-[#0A0F1A] to-black">
          <div
            className="pointer-events-none absolute inset-0 opacity-40"
            style={{
              backgroundImage:
                'radial-gradient(circle at 30% 25%, rgba(16,185,129,.35) 0, transparent 45%), radial-gradient(circle at 75% 65%, rgba(37,99,235,.3) 0, transparent 45%)',
            }}
          />

          <div className="relative flex flex-1 flex-col items-center justify-center px-6">
            <span className="relative mb-5 flex h-24 w-24 items-center justify-center">
              <span className="absolute inset-0 animate-pulse-ring rounded-full bg-success/40" />
              <span className="relative grid h-24 w-24 place-items-center rounded-full bg-success/15 ring-1 ring-success/40">
                <Radio size={38} className="text-success" />
              </span>
            </span>

            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-white/50">Status</p>
            <h1 className="overlay-text mt-1 text-5xl font-black tracking-tight text-success">
              ONLINE
            </h1>
            <p className="overlay-text mt-2 text-sm text-white/70">
              Posisi terkirim {gps.lastSentAt ? formatTime(gps.lastSentAt) : 'menunggu…'}
            </p>

            <dl className="mt-8 grid w-full max-w-[16rem] grid-cols-3 gap-2 text-center">
              {[
                ['Baterai', gps.battery != null ? `${gps.battery}%` : '—'],
                ['Akurasi', gps.accuracy != null ? `${Math.round(gps.accuracy)} m` : '—'],
                ['Misi', String(active.length)],
              ].map(([label, value]) => (
                <div key={label} className="rounded-xl bg-white/10 py-2.5 backdrop-blur">
                  <dt className="text-[10px] text-white/50">{label}</dt>
                  <dd className="mt-0.5 text-base font-bold tabular-nums text-white">{value}</dd>
                </div>
              ))}
            </dl>
          </div>

          <FeedFooter
            title={user?.fullName ?? ''}
            subtitle={`${user?.unitName ?? 'Tanpa unit'} · ${user?.badgeNumber ?? '—'}`}
            caption={
              gps.lat != null && gps.lng != null
                ? `${gps.lat.toFixed(5)}, ${gps.lng.toFixed(5)}`
                : 'Menunggu sinyal GPS…'
            }
          />

          {active.length > 0 && (
            <div className="pointer-events-none absolute inset-x-0 bottom-28 flex flex-col items-center gap-1 text-white/45">
              <ChevronUp size={18} className="animate-bounce" />
              <span className="text-[10px] font-semibold">
                Geser untuk lihat {active.length} misi
              </span>
            </div>
          )}
        </section>

        {/* ------------------------------------------------- mission cards --- */}
        {active.map((mission) => {
          const mine = mission.assignees.find((a) => a.id === user?.id);
          const accepted = mine?.status !== 'assigned';

          return (
            <section
              key={mission.id}
              className="feed-card bg-gradient-to-b from-[#1A1206] via-[#120C04] to-black"
            >
              <div
                className="pointer-events-none absolute inset-0 opacity-40"
                style={{
                  backgroundImage:
                    'radial-gradient(circle at 70% 20%, rgba(245,158,11,.35) 0, transparent 50%), radial-gradient(circle at 20% 70%, rgba(239,68,68,.25) 0, transparent 45%)',
                }}
              />

              <div className="relative flex flex-1 flex-col justify-center px-6">
                <span
                  className={cx(
                    'w-fit rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-wide',
                    mission.priority === 'critical'
                      ? 'bg-live text-white'
                      : mission.priority === 'high'
                        ? 'bg-warning text-ink'
                        : 'bg-white/15 text-white',
                  )}
                >
                  {PRIORITY_LABEL[mission.priority]}
                </span>

                <h2 className="overlay-text mt-4 text-3xl font-black leading-tight text-white">
                  {mission.title}
                </h2>

                {mission.description && (
                  <p className="overlay-text mt-3 line-clamp-4 text-sm leading-relaxed text-white/75">
                    {mission.description}
                  </p>
                )}

                <p className="mt-4 text-xs text-white/50">
                  {mission.commanderName ?? 'Komando'}
                  {mission.deadline && ` · tenggat ${formatDateTime(mission.deadline)}`}
                </p>

                <button
                  type="button"
                  onClick={() =>
                    accepted ? complete.mutate(mission.id) : accept.mutate(mission.id)
                  }
                  disabled={accept.isPending || complete.isPending || mine?.status === 'completed'}
                  className={cx(
                    'mt-7 flex h-14 w-[calc(100%-4.5rem)] items-center justify-center gap-2 rounded-2xl text-base font-bold transition-transform active:scale-[0.98] disabled:opacity-50',
                    accepted ? 'bg-success text-white' : 'bg-live text-white',
                  )}
                >
                  {accept.isPending || complete.isPending ? (
                    <Spinner size={20} />
                  ) : accepted ? (
                    <CheckCircle2 size={20} />
                  ) : (
                    <PlayCircle size={20} />
                  )}
                  {mine?.status === 'completed'
                    ? 'SUDAH SELESAI'
                    : accepted
                      ? 'TANDAI SELESAI'
                      : 'TERIMA MISI'}
                </button>
              </div>

              <FeedFooter
                title={`Misi #${mission.id}`}
                subtitle={mission.assignees.map((a) => a.fullName).join(', ')}
                caption={mission.status === 'running' ? 'Sedang berjalan' : 'Menunggu diterima'}
              />
            </section>
          );
        })}
      </div>

      <ActionRail onNavigate={navigate} />
    </div>
  );
}

/* ------------------------------------------------------------- pieces ----- */

/** Overlaid caption block, bottom-left — the short-video convention. */
function FeedFooter({
  title,
  subtitle,
  caption,
}: {
  title: string;
  subtitle: string;
  caption: string;
}) {
  return (
    <div className="relative z-10 max-w-[calc(100%-5rem)] px-5 pb-6">
      <p className="overlay-text text-base font-bold text-white">{title}</p>
      <p className="overlay-text mt-0.5 truncate text-xs text-white/70">{subtitle}</p>
      <p className="overlay-text mt-1.5 flex items-center gap-1 font-mono text-[11px] text-white/55">
        <MapPin size={11} />
        {caption}
      </p>
    </div>
  );
}

/** Right-hand vertical rail of circular actions. */
function ActionRail({ onNavigate }: { onNavigate: (to: string) => void }) {
  const actions = [
    { to: '/app/stream', label: 'Siaran', icon: Video, tone: 'bg-live/90' },
    { to: '/app/report', label: 'Lapor', icon: FileText, tone: 'bg-white/15' },
    { to: '/app/mission', label: 'Misi', icon: Target, tone: 'bg-white/15' },
    {
      to: '/app/chat',
      label: 'Pesan',
      icon: MessageSquare,
      tone: 'bg-white/15',
    },
  ];

  return (
    // pointer-events-none on the column, auto on the buttons: the rail sits on
    // its own layer above the feed without stealing swipe gestures from the
    // strip of screen it covers.
    <div className="pointer-events-none absolute bottom-6 right-3 z-30 flex flex-col items-center gap-4">
      {actions.map((action) => (
        <Link
          key={action.to}
          to={action.to}
          onClick={(e) => {
            e.preventDefault();
            onNavigate(action.to);
          }}
          className="pointer-events-auto block"
        >
          <span className={cx('rail-btn', action.tone)}>
            <action.icon size={22} />
          </span>
          <span className="rail-label">{action.label}</span>
        </Link>
      ))}
    </div>
  );
}
