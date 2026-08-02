import { useQuery } from '@tanstack/react-query';
import {
  AlertCircle,
  LogOut,
  MonitorUp,
  MonitorX,
  Radio,
  ScreenShare,
  Signal,
  Video,
  VideoOff,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Spinner } from '../components/ui/Primitives';
import { useNow, useSocketStatus } from '../hooks/useSocketEvent';
import { api, apiErrorMessage } from '../lib/api';
import { cx, duration } from '../lib/format';
import { publishScreenToRoom, type StreamCredentials } from '../lib/livekit';
import type { Mission } from '../lib/types';
import { useAuth } from '../store/auth';

type Phase = 'idle' | 'starting' | 'live' | 'stopping';

/**
 * Screen-share station.
 *
 * Capture is a separate, explicit step before broadcasting — `getDisplayMedia()`
 * needs transient user activation that an API round-trip would consume, and an
 * operator about to put a console on the command wall should see exactly what
 * they picked first.
 */
export default function ScreenStudio() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const now = useNow();
  const socketStatus = useSocketStatus();

  const videoRef = useRef<HTMLVideoElement>(null);
  const roomRef = useRef<Awaited<ReturnType<typeof publishScreenToRoom>> | null>(null);
  const captured = useRef<MediaStream | null>(null);

  const [phase, setPhase] = useState<Phase>('idle');
  const [error, setError] = useState<string | null>(null);
  const [previewOnly, setPreviewOnly] = useState(false);
  const [hasCapture, setHasCapture] = useState(false);
  const [sourceLabel, setSourceLabel] = useState<string | null>(null);
  const [resolution, setResolution] = useState<string | null>(null);
  const [withAudio, setWithAudio] = useState(false);
  const [startedAt, setStartedAt] = useState<Date | null>(null);
  const [elapsed, setElapsed] = useState('00:00');

  const missions = useQuery({
    queryKey: ['my-missions'],
    queryFn: async () => {
      const { data } = await api.get<{ missions: Mission[] }>('/missions', { params: { limit: 10 } });
      return data.missions;
    },
  });

  useEffect(() => {
    if (phase !== 'live' || !startedAt) return;
    const id = setInterval(() => setElapsed(duration(startedAt)), 1000);
    return () => clearInterval(id);
  }, [phase, startedAt]);

  useEffect(() => {
    const onUnload = () => {
      if (roomRef.current || phase === 'live') navigator.sendBeacon?.('/api/streams/stop');
    };
    window.addEventListener('pagehide', onUnload);
    return () => window.removeEventListener('pagehide', onUnload);
  }, [phase]);

  useEffect(
    () => () => {
      captured.current?.getTracks().forEach((t) => t.stop());
    },
    []
  );

  function releaseCapture() {
    captured.current?.getTracks().forEach((t) => t.stop());
    captured.current = null;
    setHasCapture(false);
    setSourceLabel(null);
    setResolution(null);
    if (videoRef.current) videoRef.current.srcObject = null;
  }

  /** Must run directly from the click: display capture needs user activation. */
  async function pickSource() {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: { ideal: 15, max: 30 } },
        audio: true,
      });

      captured.current?.getTracks().forEach((t) => t.stop());
      captured.current = stream;

      const track = stream.getVideoTracks()[0];
      const settings = track.getSettings();
      setSourceLabel(track.label || 'Layar terpilih');
      setResolution(settings.width ? `${settings.width}×${settings.height}` : null);
      setWithAudio(stream.getAudioTracks().length > 0);
      setHasCapture(true);

      if (videoRef.current) videoRef.current.srcObject = stream;

      // The browser's own "Stop sharing" bar ends the track outside our UI; the
      // broadcast has to follow, or the command centre keeps a dead tile.
      track.addEventListener('ended', () => {
        void handleNativeStop();
      });
    } catch (err) {
      const name = (err as Error).name;
      if (name === 'NotAllowedError') return; // operator dismissed the picker
      setError(
        window.isSecureContext
          ? 'Tidak dapat menangkap layar. Periksa izin browser.'
          : 'Berbagi layar diblokir karena koneksi tidak aman (HTTP). Buka melalui HTTPS atau localhost.'
      );
    }
  }

  async function handleNativeStop() {
    if (roomRef.current) {
      await roomRef.current.stop().catch(() => undefined);
      roomRef.current = null;
      await api.post('/streams/stop').catch(() => undefined);
    }
    setPhase('idle');
    setStartedAt(null);
    setPreviewOnly(false);
    releaseCapture();
  }

  async function start() {
    if (!captured.current) return;
    setPhase('starting');
    setError(null);
    try {
      const { data } = await api.post<StreamCredentials & { streamId: number }>('/streams/start');

      if (data.live && data.token) {
        roomRef.current = await publishScreenToRoom(data, captured.current, {
          videoEl: videoRef.current ?? undefined,
        });
        setPreviewOnly(false);
      } else {
        setPreviewOnly(true);
      }

      setStartedAt(new Date());
      setElapsed('00:00');
      setPhase('live');
    } catch (err) {
      setError(apiErrorMessage(err, 'Gagal memulai siaran'));
      setPhase('idle');
    }
  }

  async function stop() {
    setPhase('stopping');
    try {
      await roomRef.current?.stop();
      roomRef.current = null;
      await api.post('/streams/stop');
      setStartedAt(null);
      setPhase('idle');
      setPreviewOnly(false);
      releaseCapture();
    } catch (err) {
      setError(apiErrorMessage(err, 'Gagal menghentikan siaran'));
      setPhase('live');
    }
  }

  const live = phase === 'live';
  const online = socketStatus === 'connected';
  const activeMissions = (missions.data ?? []).filter(
    (m) => m.status === 'pending' || m.status === 'running'
  );

  return (
    <div className="flex min-h-screen flex-col bg-canvas">
      <header className="border-b border-line bg-canvas-raised">
        <div className="mx-auto flex h-16 max-w-7xl items-center gap-4 px-4 lg:px-6">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-accent text-white shadow-soft">
            <ScreenShare size={20} />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-sm font-semibold text-ink">Berbagi Layar</h1>
            <p className="truncate text-xs text-ink-muted">
              {user?.fullName} · {user?.unitName ?? 'Tanpa unit'} · {user?.badgeNumber ?? '—'}
            </p>
          </div>

          <span
            className={cx(
              'hidden items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-semibold md:flex',
              online
                ? 'border-success/25 bg-success-soft text-success-strong'
                : 'border-danger/25 bg-danger-soft text-danger-strong'
            )}
          >
            <Signal size={14} />
            {online ? 'TERHUBUNG' : 'TERPUTUS'}
          </span>

          <span className="hidden font-mono text-lg font-semibold tabular-nums text-ink lg:block">
            {now.toLocaleTimeString('id-ID', { hour12: false })}
          </span>

          <button
            type="button"
            onClick={async () => {
              if (live) await stop();
              await logout();
              navigate('/login', { replace: true });
            }}
            className="btn-secondary btn-md"
          >
            <LogOut size={16} />
            Keluar
          </button>
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-5 lg:px-6">
        <div className="grid gap-5 lg:grid-cols-[2fr_1fr]">
          <section>
            <div className="relative overflow-hidden rounded-xl border border-line bg-ink shadow-soft">
              <div className="aspect-video w-full">
                {/* object-contain: a shared screen rarely matches 16:9, and
                    cropping would hide exactly the edges of a console. */}
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className="h-full w-full object-contain"
                />
              </div>

              {!hasCapture && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-white/70">
                  <MonitorUp size={34} />
                  <p className="text-sm font-medium">Belum ada layar dipilih</p>
                  <p className="max-w-xs text-center text-xs text-white/50">
                    Pilih layar, jendela, atau tab yang akan disiarkan ke pusat komando.
                  </p>
                </div>
              )}

              <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-2 p-3">
                {live ? (
                  <span className="flex items-center gap-1.5 rounded-md bg-danger px-2 py-1 text-xs font-bold text-white">
                    <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" />
                    MENYIARKAN
                  </span>
                ) : (
                  hasCapture && (
                    <span className="rounded-md bg-white/15 px-2 py-1 text-xs font-bold text-white backdrop-blur">
                      PRATINJAU
                    </span>
                  )
                )}

                <div className="flex items-center gap-2">
                  {resolution && (
                    <span className="rounded-md bg-black/50 px-2 py-1 font-mono text-xs text-white backdrop-blur">
                      {resolution}
                    </span>
                  )}
                  {live && (
                    <span className="rounded-md bg-black/50 px-2 py-1 font-mono text-xs text-white backdrop-blur">
                      {elapsed}
                    </span>
                  )}
                </div>
              </div>

              {previewOnly && live && (
                <p className="absolute inset-x-3 bottom-3 rounded-lg bg-warning/90 px-3 py-2 text-center text-xs font-medium text-ink">
                  Server streaming tidak terjangkau — siaran tercatat di pusat komando, tetapi layar
                  belum diteruskan. Hubungi administrator sistem.
                </p>
              )}
            </div>

            {error && (
              <p className="mt-3 flex items-start gap-2 rounded-lg border border-danger/25 bg-danger-soft px-3 py-2.5 text-sm text-danger-strong">
                <AlertCircle size={16} className="mt-0.5 shrink-0" />
                {error}
              </p>
            )}

            <div className="mt-4 grid grid-cols-3 gap-3">
              <button
                type="button"
                onClick={pickSource}
                disabled={live}
                className="btn-secondary h-14 text-base"
                title={live ? 'Hentikan siaran untuk mengganti layar' : undefined}
              >
                <MonitorUp size={20} />
                {hasCapture ? 'Ganti Layar' : 'Pilih Layar'}
              </button>
              <button
                type="button"
                onClick={start}
                disabled={!hasCapture || live || phase === 'starting'}
                className="btn-primary h-14 text-base"
              >
                {phase === 'starting' ? <Spinner size={20} /> : <Video size={20} />}
                MULAI SIARAN
              </button>
              <button
                type="button"
                onClick={stop}
                disabled={phase !== 'live'}
                className="btn-danger h-14 text-base"
              >
                {phase === 'stopping' ? <Spinner size={20} /> : <VideoOff size={20} />}
                HENTIKAN
              </button>
            </div>
          </section>

          <aside className="space-y-4">
            <section className="card p-4">
              <h2 className="flex items-center gap-2 text-sm font-semibold text-ink">
                <MonitorUp size={16} className="text-accent" />
                Sumber Layar
              </h2>

              {hasCapture ? (
                <dl className="mt-3 space-y-2 text-sm">
                  <div>
                    <dt className="text-xs text-ink-muted">Sumber</dt>
                    <dd className="mt-0.5 break-words font-medium text-ink">{sourceLabel}</dd>
                  </div>
                  <div className="flex items-center justify-between">
                    <dt className="text-ink-muted">Resolusi</dt>
                    <dd className="font-mono font-semibold text-ink">{resolution ?? '—'}</dd>
                  </div>
                  <div className="flex items-center justify-between">
                    <dt className="text-ink-muted">Audio sistem</dt>
                    <dd
                      className={cx(
                        'font-semibold',
                        withAudio ? 'text-success-strong' : 'text-ink-muted'
                      )}
                    >
                      {withAudio ? 'Disertakan' : 'Tidak'}
                    </dd>
                  </div>
                </dl>
              ) : (
                <p className="mt-2 text-xs text-ink-muted">
                  Tekan <strong className="text-ink">Pilih Layar</strong> untuk memilih sumber.
                  Centang "bagikan audio" pada dialog browser bila suara sistem perlu ikut
                  disiarkan.
                </p>
              )}

              {hasCapture && !live && (
                <button
                  type="button"
                  onClick={releaseCapture}
                  className="btn-secondary btn-md mt-3 w-full"
                >
                  <MonitorX size={16} />
                  Lepas sumber
                </button>
              )}

              {live && (
                <p className="mt-3 rounded-lg bg-canvas px-3 py-2 text-xs text-ink-muted">
                  Menghentikan berbagi dari bilah browser juga akan mengakhiri siaran secara
                  otomatis.
                </p>
              )}
            </section>

            <section className="card p-4">
              <h2 className="flex items-center gap-2 text-sm font-semibold text-ink">
                <Radio size={16} className="text-danger" />
                Status
              </h2>
              <dl className="mt-3 space-y-2 text-sm">
                <div className="flex items-center justify-between">
                  <dt className="text-ink-muted">Siaran</dt>
                  <dd className={cx('font-semibold', live ? 'text-danger' : 'text-ink-muted')}>
                    {live ? (previewOnly ? 'Tercatat (pratinjau)' : 'Diteruskan') : 'Tidak aktif'}
                  </dd>
                </div>
                <div className="flex items-center justify-between">
                  <dt className="text-ink-muted">Durasi</dt>
                  <dd className="font-mono font-semibold tabular-nums text-ink">
                    {live ? elapsed : '—'}
                  </dd>
                </div>
              </dl>
            </section>

            {activeMissions.length > 0 && (
              <section className="card overflow-hidden">
                <header className="card-header">
                  <h2 className="card-title">Misi ({activeMissions.length})</h2>
                </header>
                <ul className="divide-y divide-line">
                  {activeMissions.map((m) => (
                    <li key={m.id} className="px-4 py-3">
                      <p className="text-sm font-medium text-ink">{m.title}</p>
                      <p className="mt-0.5 text-xs text-ink-muted">
                        {m.commanderName ?? 'Komando'} · {m.status}
                      </p>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </aside>
        </div>
      </main>
    </div>
  );
}
