import { useQuery } from '@tanstack/react-query';
import {
  AlertCircle,
  Camera,
  LogOut,
  Mic,
  MicOff,
  Plane,
  RefreshCw,
  Radio,
  Signal,
  Video,
  VideoOff,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Spinner } from '../components/ui/Primitives';
import { useNow, useSocketStatus } from '../hooks/useSocketEvent';
import { api, apiErrorMessage } from '../lib/api';
import { cx, duration } from '../lib/format';
import { publishToRoom, type StreamCredentials } from '../lib/livekit';
import type { Mission } from '../lib/types';
import { useAuth } from '../store/auth';

type Phase = 'idle' | 'starting' | 'live' | 'stopping';

/**
 * Drone ground station console.
 *
 * Deliberately desktop-shaped, unlike the phone-first personnel app: the
 * operator sits at a laptop and the video source is a capture device carrying
 * the aircraft's downlink, so picking the right input is the central control —
 * a laptop typically exposes a built-in webcam alongside the capture card, and
 * broadcasting the wrong one is the obvious failure.
 */
export default function DroneStudio() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const now = useNow();
  const socketStatus = useSocketStatus();

  const videoRef = useRef<HTMLVideoElement>(null);
  const roomRef = useRef<Awaited<ReturnType<typeof publishToRoom>> | null>(null);
  const localStream = useRef<MediaStream | null>(null);
  const previewSeq = useRef(0);

  const [phase, setPhase] = useState<Phase>('idle');
  const [error, setError] = useState<string | null>(null);
  const [previewOnly, setPreviewOnly] = useState(false);
  const [micOn, setMicOn] = useState(true);
  const [startedAt, setStartedAt] = useState<Date | null>(null);
  const [elapsed, setElapsed] = useState('00:00');
  const [resolution, setResolution] = useState<string | null>(null);

  const [cameras, setCameras] = useState<MediaDeviceInfo[]>([]);
  const [mics, setMics] = useState<MediaDeviceInfo[]>([]);
  const [cameraId, setCameraId] = useState('');
  const [micId, setMicId] = useState('');

  const missions = useQuery({
    queryKey: ['my-missions'],
    queryFn: async () => {
      const { data } = await api.get<{ missions: Mission[] }>('/missions', { params: { limit: 10 } });
      return data.missions;
    },
  });

  /** Device labels stay blank until permission is granted, so enumerate after. */
  const loadDevices = useCallback(async () => {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      setCameras(devices.filter((d) => d.kind === 'videoinput'));
      setMics(devices.filter((d) => d.kind === 'audioinput'));
    } catch {
      /* enumeration is best-effort; the preview error already explains failures */
    }
  }, []);

  const startPreview = useCallback(async () => {
    const seq = ++previewSeq.current;
    localStream.current?.getTracks().forEach((t) => t.stop());
    localStream.current = null;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          ...(cameraId ? { deviceId: { exact: cameraId } } : {}),
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
        audio: false,
      });

      if (seq !== previewSeq.current) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }

      localStream.current = stream;
      if (videoRef.current) videoRef.current.srcObject = stream;

      const settings = stream.getVideoTracks()[0]?.getSettings();
      setResolution(settings?.width ? `${settings.width}×${settings.height}` : null);
      setError(null);
      void loadDevices();
    } catch {
      setError(
        window.isSecureContext
          ? 'Tidak dapat mengakses perangkat video. Periksa izin browser dan pastikan capture device terpasang.'
          : 'Kamera diblokir karena koneksi tidak aman (HTTP). Buka melalui HTTPS atau localhost.'
      );
    }
  }, [cameraId, loadDevices]);

  useEffect(() => {
    void startPreview();
    return () => {
      localStream.current?.getTracks().forEach((t) => t.stop());
    };
  }, [startPreview]);

  useEffect(() => {
    if (phase !== 'live' || !startedAt) return;
    const id = setInterval(() => setElapsed(duration(startedAt)), 1000);
    return () => clearInterval(id);
  }, [phase, startedAt]);

  // A closed tab must not leave the stream marked live in the command centre.
  useEffect(() => {
    const onUnload = () => {
      if (roomRef.current || phase === 'live') navigator.sendBeacon?.('/api/streams/stop');
    };
    window.addEventListener('pagehide', onUnload);
    return () => window.removeEventListener('pagehide', onUnload);
  }, [phase]);

  async function start() {
    setPhase('starting');
    setError(null);
    try {
      const { data } = await api.post<StreamCredentials & { streamId: number }>('/streams/start');

      if (data.live && data.token) {
        localStream.current?.getTracks().forEach((t) => t.stop());
        localStream.current = null;
        roomRef.current = await publishToRoom(data, {
          videoEl: videoRef.current ?? undefined,
          videoDeviceId: cameraId || undefined,
          audioDeviceId: micId || undefined,
          audio: micOn,
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
      await startPreview();
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
            <Plane size={20} />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-sm font-semibold text-ink">Stasiun Drone</h1>
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
          {/* Monitor */}
          <section>
            <div className="relative overflow-hidden rounded-xl border border-line bg-ink shadow-soft">
              <div className="aspect-video w-full">
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className="h-full w-full object-contain"
                />
              </div>

              <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-2 p-3">
                {live ? (
                  <span className="flex items-center gap-1.5 rounded-md bg-danger px-2 py-1 text-xs font-bold text-white">
                    <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" />
                    MENYIARKAN
                  </span>
                ) : (
                  <span className="rounded-md bg-white/15 px-2 py-1 text-xs font-bold text-white backdrop-blur">
                    PRATINJAU
                  </span>
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
                  Server streaming tidak terjangkau — siaran tercatat di pusat komando, tetapi video
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

            <div className="mt-4 grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={start}
                disabled={live || phase === 'starting'}
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

          {/* Controls */}
          <aside className="space-y-4">
            <section className="card p-4">
              <h2 className="flex items-center gap-2 text-sm font-semibold text-ink">
                <Camera size={16} className="text-accent" />
                Sumber Video
              </h2>
              <p className="mt-1 text-xs text-ink-muted">
                Pilih capture device yang menerima downlink drone.
              </p>

              <select
                className="field mt-3"
                value={cameraId}
                onChange={(e) => setCameraId(e.target.value)}
                disabled={live}
                aria-label="Perangkat video"
              >
                <option value="">Perangkat bawaan</option>
                {cameras.map((d, i) => (
                  <option key={d.deviceId || i} value={d.deviceId}>
                    {d.label || `Kamera ${i + 1}`}
                  </option>
                ))}
              </select>

              <h2 className="mt-4 flex items-center gap-2 text-sm font-semibold text-ink">
                <Mic size={16} className="text-accent" />
                Sumber Audio
              </h2>
              <select
                className="field mt-2"
                value={micId}
                onChange={(e) => setMicId(e.target.value)}
                disabled={live}
                aria-label="Perangkat audio"
              >
                <option value="">Perangkat bawaan</option>
                {mics.map((d, i) => (
                  <option key={d.deviceId || i} value={d.deviceId}>
                    {d.label || `Mikrofon ${i + 1}`}
                  </option>
                ))}
              </select>

              <div className="mt-3 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={async () => {
                    const next = !micOn;
                    setMicOn(next);
                    await roomRef.current?.setMicEnabled(next);
                  }}
                  className="btn-secondary btn-md"
                >
                  {micOn ? <Mic size={16} /> : <MicOff size={16} className="text-danger" />}
                  {micOn ? 'Mic Aktif' : 'Mic Mati'}
                </button>
                <button
                  type="button"
                  onClick={() => void startPreview()}
                  className="btn-secondary btn-md"
                  disabled={live}
                  title={live ? 'Hentikan siaran untuk mengganti perangkat' : undefined}
                >
                  <RefreshCw size={16} />
                  Muat ulang
                </button>
              </div>

              {live && (
                <p className="mt-3 rounded-lg bg-canvas px-3 py-2 text-xs text-ink-muted">
                  Perangkat dikunci selama siaran berlangsung. Hentikan siaran untuk menggantinya.
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
                <div className="flex items-center justify-between">
                  <dt className="text-ink-muted">Resolusi</dt>
                  <dd className="font-mono font-semibold text-ink">{resolution ?? '—'}</dd>
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
