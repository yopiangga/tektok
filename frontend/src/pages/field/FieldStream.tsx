import { FileText, Mic, MicOff, RefreshCw, X } from 'lucide-react';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../store/auth';
import { api, apiErrorMessage } from '../../lib/api';
import { cx, duration } from '../../lib/format';
import { publishToRoom, type StreamCredentials } from '../../lib/livekit';
import { Spinner } from '../../components/ui/Primitives';

type Phase = 'idle' | 'starting' | 'live' | 'stopping';

export default function FieldStream() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const videoRef = useRef<HTMLVideoElement>(null);
  const roomRef = useRef<Awaited<ReturnType<typeof publishToRoom>> | null>(null);
  const localStream = useRef<MediaStream | null>(null);
  /** Guards against overlapping preview starts racing to own the camera. */
  const previewSeq = useRef(0);

  const [phase, setPhase] = useState<Phase>('idle');
  const [micOn, setMicOn] = useState(true);
  const [facing, setFacing] = useState<'user' | 'environment'>('environment');
  const [startedAt, setStartedAt] = useState<Date | null>(null);
  const [elapsed, setElapsed] = useState('00:00');
  const [error, setError] = useState<string | null>(null);
  const [previewOnly, setPreviewOnly] = useState(false);

  /** Local camera preview — runs whether or not LiveKit is reachable. */
  const startPreview = useCallback(async () => {
    const seq = ++previewSeq.current;
    localStream.current?.getTracks().forEach((track) => track.stop());
    localStream.current = null;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        // Ask for 720p here too. A browser handed a second request for a camera
        // it already has open reuses the existing capture session, so a 480p
        // preview would silently cap the published stream at 480p.
        video: { facingMode: facing, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });

      // A newer call started while we awaited: discard this stream instead of
      // leaking a camera session that would pin the resolution for everyone.
      if (seq !== previewSeq.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }

      localStream.current = stream;
      if (videoRef.current) videoRef.current.srcObject = stream;
      setError(null);
    } catch {
      // Same secure-context rule as geolocation: getUserMedia is unavailable on
      // a plain-HTTP LAN address, and "check your permissions" would be a dead end.
      setError(
        window.isSecureContext
          ? 'Tidak dapat mengakses kamera. Periksa izin browser.'
          : 'Kamera diblokir karena koneksi tidak aman (HTTP). Buka aplikasi melalui HTTPS atau localhost.'
      );
    }
  }, [facing]);

  useEffect(() => {
    void startPreview();
    return () => {
      localStream.current?.getTracks().forEach((track) => track.stop());
    };
  }, [startPreview]);

  useEffect(() => {
    if (phase !== 'live' || !startedAt) return;
    const id = setInterval(() => setElapsed(duration(startedAt)), 1000);
    return () => clearInterval(id);
  }, [phase, startedAt]);

  // A closed tab must not leave a stream marked live in the command centre.
  useEffect(() => {
    const onUnload = () => {
      if (roomRef.current || phase === 'live') {
        navigator.sendBeacon?.('/api/streams/stop');
      }
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
        localStream.current?.getTracks().forEach((track) => track.stop());
        localStream.current = null;
        roomRef.current = await publishToRoom(data, {
          videoEl: videoRef.current ?? undefined,
          facingMode: facing,
          audio: micOn,
        });
        setPreviewOnly(false);
      } else {
        // LiveKit disabled: the stream is registered, preview keeps running.
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

  async function toggleMic() {
    const next = !micOn;
    setMicOn(next);
    await roomRef.current?.setMicEnabled(next);
  }

  const live = phase === 'live';

  return (
    // Camera owns the whole screen; every control floats above it.
    <div className="relative h-full w-full overflow-hidden bg-night">
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className="absolute inset-0 h-full w-full object-cover"
      />

      {/* Legibility scrims top and bottom */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-black/70 to-transparent" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-56 bg-gradient-to-t from-black/80 to-transparent" />

      {/* Close */}
      <button
        type="button"
        onClick={() => navigate('/app')}
        className="absolute left-4 top-[max(0.75rem,env(safe-area-inset-top))] z-30 grid h-10 w-10 place-items-center rounded-full bg-black/40 text-white backdrop-blur"
        aria-label="Tutup"
      >
        <X size={20} />
      </button>

      {/* LIVE pill + timer */}
      {live && (
        <div className="absolute left-1/2 top-[max(0.9rem,env(safe-area-inset-top))] z-30 flex -translate-x-1/2 items-center gap-2">
          <span className="flex items-center gap-1.5 rounded-full bg-live px-3 py-1 text-xs font-black tracking-wide text-white">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" />
            LIVE
          </span>
          <span className="rounded-full bg-black/50 px-2.5 py-1 font-mono text-xs text-white backdrop-blur">
            {elapsed}
          </span>
        </div>
      )}

      {/* Right rail */}
      <div className="absolute bottom-40 right-3 z-30 flex flex-col items-center gap-4">
        <button type="button" onClick={toggleMic} className="block" aria-label="Mikrofon">
          <span className={cx('rail-btn', !micOn && 'bg-live/90')}>
            {micOn ? <Mic size={22} /> : <MicOff size={22} />}
          </span>
          <span className="rail-label">{micOn ? 'Mic On' : 'Mic Off'}</span>
        </button>

        <button
          type="button"
          onClick={() => setFacing((prev) => (prev === 'user' ? 'environment' : 'user'))}
          disabled={live}
          className="block disabled:opacity-40"
          aria-label="Balik kamera"
          title={live ? 'Hentikan siaran untuk mengganti kamera' : undefined}
        >
          <span className="rail-btn">
            <RefreshCw size={22} />
          </span>
          <span className="rail-label">Balik</span>
        </button>

        <Link to="/app/report" className="block" aria-label="Kirim laporan">
          <span className="rail-btn">
            <FileText size={22} />
          </span>
          <span className="rail-label">Lapor</span>
        </Link>
      </div>

      {/* Caption block, bottom-left */}
      <div className="absolute bottom-32 left-0 z-20 max-w-[calc(100%-5rem)] px-5">
        <p className="overlay-text text-base font-bold text-white">{user?.fullName}</p>
        <p className="overlay-text mt-0.5 text-xs text-white/70">
          {user?.unitName ?? 'Tanpa unit'} · {user?.badgeNumber ?? '—'}
        </p>
        <p className="overlay-text mt-1.5 text-[11px] text-white/60">
          {live
            ? previewOnly
              ? 'Tercatat di komando — video belum diteruskan'
              : 'Disiarkan ke pusat komando'
            : 'Siap menyiarkan'}
        </p>
      </div>

      {/* Shutter — the single primary control */}
      <div className="absolute inset-x-0 bottom-0 z-30 flex flex-col items-center pb-[max(1.5rem,env(safe-area-inset-bottom))]">
        {error && (
          <p className="mx-5 mb-3 rounded-xl bg-danger/90 px-3 py-2 text-center text-[11px] font-medium text-white">
            {error}
          </p>
        )}
        {previewOnly && live && (
          <p className="mx-5 mb-3 rounded-xl bg-warning/90 px-3 py-2 text-center text-[11px] font-medium text-ink">
            Server streaming tidak terjangkau — hubungi administrator sistem.
          </p>
        )}

        <button
          type="button"
          onClick={live ? stop : start}
          disabled={phase === 'starting' || phase === 'stopping'}
          className="relative grid h-20 w-20 place-items-center rounded-full transition-transform active:scale-95 disabled:opacity-60"
          aria-label={live ? 'Hentikan siaran' : 'Mulai siaran'}
        >
          <span
            className={cx(
              'absolute inset-0 rounded-full border-4',
              live ? 'border-live' : 'border-white'
            )}
          />
          <span
            className={cx(
              'bg-live transition-all duration-200',
              live ? 'h-7 w-7 rounded-md' : 'h-[3.75rem] w-[3.75rem] rounded-full'
            )}
          />
          {(phase === 'starting' || phase === 'stopping') && (
            <span className="absolute inset-0 grid place-items-center">
              <Spinner size={22} className="text-white" />
            </span>
          )}
        </button>

        <p className="mt-2 text-[11px] font-semibold text-white/70">
          {live ? 'Ketuk untuk berhenti' : 'Ketuk untuk siaran'}
        </p>
      </div>
    </div>
  );
}
