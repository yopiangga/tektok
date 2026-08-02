import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarClock, CheckCircle2, PlayCircle, Target, User } from 'lucide-react';
import { EmptyState, PanelLoading, Spinner } from '../../components/ui/Primitives';
import { api } from '../../lib/api';
import {
  MISSION_STATUS_CHIP,
  MISSION_STATUS_LABEL,
  PRIORITY_CHIP,
  PRIORITY_LABEL,
  cx,
  formatDateTime,
} from '../../lib/format';
import type { Mission } from '../../lib/types';
import { useAuth } from '../../store/auth';

export default function FieldMission() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const missions = useQuery({
    queryKey: ['my-missions'],
    queryFn: async () => {
      const { data } = await api.get<{ missions: Mission[] }>('/missions', { params: { limit: 30 } });
      return data.missions;
    },
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['my-missions'] });
  };

  const accept = useMutation({
    mutationFn: (id: number) => api.post(`/missions/${id}/accept`),
    onSuccess: invalidate,
  });

  const complete = useMutation({
    mutationFn: (id: number) => api.post('/missions/complete', { missionId: id }),
    onSuccess: invalidate,
  });

  const list = missions.data ?? [];
  const active = list.filter((m) => m.status === 'pending' || m.status === 'running');
  const done = list.filter((m) => m.status === 'completed' || m.status === 'cancelled');

  /** The signed-in user's own assignment row drives which button shows. */
  const myAssignment = (mission: Mission) => mission.assignees.find((a) => a.id === user?.id);

  return (
    <div className="field-page">
      <div>
        <h1 className="text-xl font-bold text-white">Misi Saya</h1>
        <p className="mt-0.5 text-sm text-white/55">
          Terima penugasan lalu tandai selesai setelah dilaksanakan.
        </p>
      </div>

      {missions.isLoading ? (
        <div className="rounded-2xl border border-night-line bg-night-raised">
          <PanelLoading />
        </div>
      ) : list.length === 0 ? (
        <div className="rounded-2xl border border-night-line bg-night-raised">
          <EmptyState
            icon={<Target size={22} />}
            title="Belum ada misi"
            hint="Penugasan dari komandan akan muncul di sini."
          />
        </div>
      ) : (
        <>
          {active.map((mission) => {
            const assignment = myAssignment(mission);
            return (
              <article key={mission.id} className="rounded-2xl border border-night-line bg-night-raised p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={cx('chip', PRIORITY_CHIP[mission.priority])}>
                    {PRIORITY_LABEL[mission.priority]}
                  </span>
                  <span className={cx('chip', MISSION_STATUS_CHIP[mission.status])}>
                    {MISSION_STATUS_LABEL[mission.status]}
                  </span>
                </div>

                <h2 className="mt-2.5 text-lg font-bold leading-snug text-white">{mission.title}</h2>

                {mission.description && (
                  <p className="mt-1.5 text-sm leading-relaxed text-white/80">
                    {mission.description}
                  </p>
                )}

                <dl className="mt-3 space-y-1.5 rounded-lg bg-night px-3 py-2.5 text-sm">
                  <div className="flex items-center gap-2 text-white/55">
                    <User size={14} />
                    <span className="text-white">{mission.commanderName ?? 'Komando'}</span>
                  </div>
                  <div className="flex items-center gap-2 text-white/55">
                    <CalendarClock size={14} />
                    <span className="text-white">
                      Ditugaskan {formatDateTime(mission.createdAt)}
                      {mission.deadline && ` · tenggat ${formatDateTime(mission.deadline)}`}
                    </span>
                  </div>
                </dl>

                {assignment?.status === 'assigned' ? (
                  <button
                    type="button"
                    className="btn-primary h-14 mt-3 w-full text-base"
                    onClick={() => accept.mutate(mission.id)}
                    disabled={accept.isPending}
                  >
                    {accept.isPending ? <Spinner size={20} /> : <PlayCircle size={20} />}
                    TERIMA MISI
                  </button>
                ) : (
                  <button
                    type="button"
                    className="btn-primary h-14 mt-3 w-full text-base"
                    onClick={() => complete.mutate(mission.id)}
                    disabled={complete.isPending || assignment?.status === 'completed'}
                  >
                    {complete.isPending ? <Spinner size={20} /> : <CheckCircle2 size={20} />}
                    {assignment?.status === 'completed' ? 'SUDAH DISELESAIKAN' : 'TANDAI SELESAI'}
                  </button>
                )}
              </article>
            );
          })}

          {done.length > 0 && (
            <section className="rounded-2xl border border-night-line bg-night-raised overflow-hidden">
              <header className="card-header">
                <h2 className="card-title">Riwayat ({done.length})</h2>
              </header>
              <ul className="divide-y divide-night-line">
                {done.map((mission) => (
                  <li key={mission.id} className="flex items-center gap-3 px-4 py-3">
                    <CheckCircle2 size={16} className="shrink-0 text-success" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-white">
                        {mission.title}
                      </span>
                      <span className="block text-[11px] text-white/55">
                        {mission.completedAt ? formatDateTime(mission.completedAt) : '—'}
                      </span>
                    </span>
                    <span className={cx('chip shrink-0', MISSION_STATUS_CHIP[mission.status])}>
                      {MISSION_STATUS_LABEL[mission.status]}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </div>
  );
}
