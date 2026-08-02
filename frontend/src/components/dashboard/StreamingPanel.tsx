import { Grid2x2, Grid3x3, Maximize2, Video, VideoOff, Volume2, VolumeX, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useStreamSubscription } from '../../hooks/useStreamSubscription';
import { cx, duration } from '../../lib/format';
import type { Quality } from '../../lib/livekit';
import type { Stream } from '../../lib/types';
import { EmptyState, Modal, PanelLoading } from '../ui/Primitives';

const QUALITY_TONE: Record<Quality, string> = {
  good: 'bg-success',
  fair: 'bg-warning',
  poor: 'bg-danger',
};

const QUALITY_LABEL: Record<Quality, string> = {
  good: 'Baik',
  fair: 'Sedang',
  poor: 'Buruk',
};

const GRIDS = [
  { key: '2x2', cols: 'grid-cols-1 sm:grid-cols-2', cap: 4, icon: Grid2x2, label: '2×2' },
  { key: '3x3', cols: 'grid-cols-2 sm:grid-cols-3', cap: 9, icon: Grid3x3, label: '3×3' },
  { key: '4x4', cols: 'grid-cols-2 sm:grid-cols-4', cap: 16, icon: Grid3x3, label: '4×4' },
] as const;

type GridKey = (typeof GRIDS)[number]['key'];

/** One live tile: subscribes to LiveKit when credentials are available. */
function StreamTile({
  stream,
  onExpand,
  onStopViewing,
  large = false,
}: {
  stream: Stream;
  onExpand?: () => void;
  onStopViewing: (id: number) => void;
  large?: boolean;
}) {
  const [muted, setMuted] = useState(true);
  const [elapsed, setElapsed] = useState(() => duration(stream.startedAt));

  // The expanded view is opened to inspect detail, so it takes the top simulcast
  // layer; grid tiles stay adaptive to keep 10 concurrent streams affordable.
  const { videoRef, state, quality } = useStreamSubscription(stream.id, stream.roomName, {
    highQuality: large,
    initialQuality: stream.quality,
  });

  useEffect(() => {
    const id = setInterval(() => setElapsed(duration(stream.startedAt)), 1000);
    return () => clearInterval(id);
  }, [stream.startedAt]);

  // LiveKit's track.attach() sets `muted = false` on the element when it binds a
  // track, overriding both the JSX prop and any earlier assignment. Re-apply on
  // every state change so the attach that promotes a tile to LIVE cannot leave
  // it audible — otherwise every stream on the wall plays at once.
  useEffect(() => {
    if (videoRef.current) videoRef.current.muted = muted;
  }, [muted, state, videoRef]);

  return (
    <article className="group relative overflow-hidden rounded-xl border border-line bg-ink">
      <div className={cx('relative w-full bg-ink', large ? 'aspect-video' : 'aspect-video')}>
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted={muted}
          className="h-full w-full object-cover"
        />

        {state !== 'live' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-ink text-white/70">
            {state === 'connecting' && (
              <>
                <Video size={22} className="animate-pulse" />
                <p className="text-xs">Menghubungkan…</p>
              </>
            )}
            {state === 'waiting' && (
              <>
                <Video size={22} className="animate-pulse text-warning" />
                <p className="text-xs">Menunggu sinyal kamera…</p>
                <p className="px-4 text-center text-[10px] leading-snug text-white/50">
                  Terhubung ke ruang siaran, tetapi perangkat belum mengirim video.
                </p>
              </>
            )}
            {state === 'preview-only' && (
              <>
                <VideoOff size={22} className="text-warning" />
                <p className="px-3 text-center text-[11px] leading-snug">
                  Server streaming tidak terjangkau.
                  <br />
                  <span className="text-white/50">Metadata siaran tetap dipantau.</span>
                </p>
              </>
            )}
            {state === 'error' && (
              <>
                <VideoOff size={22} className="text-danger" />
                <p className="text-xs">Gagal memuat siaran</p>
              </>
            )}
          </div>
        )}

        {/* Top overlay */}
        <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-2 bg-gradient-to-b from-ink/80 to-transparent p-2.5">
          <div className="min-w-0">
            <p className="truncate text-xs font-semibold text-white">{stream.officer.fullName}</p>
            <p className="truncate text-[10px] text-white/70">
              {stream.officer.unitName ?? 'Tanpa unit'} · {stream.officer.badgeNumber ?? '—'}
            </p>
          </div>
          <span
            className={cx(
              'flex shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-bold text-white',
              state === 'live' ? 'bg-danger' : 'bg-white/25 backdrop-blur'
            )}
          >
            <span
              className={cx(
                'h-1.5 w-1.5 rounded-full bg-white',
                state === 'live' && 'animate-pulse'
              )}
            />
            {state === 'live' ? 'LIVE' : 'MENUNGGU'}
          </span>
        </div>

        {/* Bottom overlay */}
        <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-2 bg-gradient-to-t from-ink/85 to-transparent p-2.5">
          <div className="flex items-center gap-2 text-[10px] text-white/85">
            <span className="font-mono tabular-nums">{elapsed}</span>
            <span className="flex items-center gap-1">
              <span className={cx('h-1.5 w-1.5 rounded-full', QUALITY_TONE[quality])} />
              {QUALITY_LABEL[quality]}
            </span>
          </div>

          <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
            <button
              type="button"
              onClick={() => setMuted((v) => !v)}
              className="grid h-7 w-7 place-items-center rounded-md bg-white/15 text-white backdrop-blur transition-colors hover:bg-white/25"
              title={muted ? 'Aktifkan suara' : 'Bisukan'}
            >
              {muted ? <VolumeX size={13} /> : <Volume2 size={13} />}
            </button>
            {onExpand && (
              <button
                type="button"
                onClick={onExpand}
                className="grid h-7 w-7 place-items-center rounded-md bg-white/15 text-white backdrop-blur transition-colors hover:bg-white/25"
                title="Perbesar"
              >
                <Maximize2 size={13} />
              </button>
            )}
            <button
              type="button"
              onClick={() => onStopViewing(stream.id)}
              className="grid h-7 w-7 place-items-center rounded-md bg-white/15 text-white backdrop-blur transition-colors hover:bg-danger"
              title="Berhenti menonton"
            >
              <X size={13} />
            </button>
          </div>
        </div>
      </div>
    </article>
  );
}

export default function StreamingPanel({
  streams,
  loading,
  expandedId,
  onExpandedChange,
}: {
  streams: Stream[];
  loading: boolean;
  expandedId: number | null;
  onExpandedChange: (id: number | null) => void;
}) {
  const [grid, setGrid] = useState<GridKey>('2x2');
  const [hidden, setHidden] = useState<Set<number>>(new Set());

  const config = GRIDS.find((g) => g.key === grid)!;
  const visible = streams.filter((s) => !hidden.has(s.id)).slice(0, config.cap);
  const expanded = streams.find((s) => s.id === expandedId) ?? null;

  return (
    <section className="card flex h-full min-h-[420px] flex-col overflow-hidden">
      <header className="card-header">
        <h2 className="card-title">
          <Video size={16} className="text-danger" />
          Siaran Langsung
          <span className="ml-1 rounded-full bg-danger-soft px-2 py-0.5 text-[11px] font-medium text-danger-strong">
            {streams.length} aktif
          </span>
        </h2>

        <Link to="/streams" className="btn-secondary btn-sm" title="Buka halaman siaran">
          <Maximize2 size={14} />
          <span className="hidden lg:inline">Semua</span>
        </Link>

        <div className="flex items-center gap-1 rounded-lg border border-line p-0.5">
          {GRIDS.map((option) => (
            <button
              key={option.key}
              type="button"
              onClick={() => setGrid(option.key)}
              className={cx(
                'rounded-md px-2 py-1 text-[11px] font-semibold transition-colors',
                grid === option.key
                  ? 'bg-accent text-white'
                  : 'text-ink-muted hover:bg-canvas-sunken'
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
      </header>

      <div className="panel-scroll min-h-0 flex-1 p-3">
        {loading && streams.length === 0 ? (
          <PanelLoading label="Memuat siaran…" />
        ) : visible.length === 0 ? (
          <EmptyState
            icon={<VideoOff size={22} />}
            title="Tidak ada siaran aktif"
            hint={
              hidden.size > 0
                ? 'Semua siaran disembunyikan. Muat ulang panel untuk menampilkannya kembali.'
                : 'Siaran akan muncul otomatis saat personel memulai live stream.'
            }
          />
        ) : (
          <div className={cx('grid gap-3', config.cols)}>
            {visible.map((stream) => (
              <StreamTile
                key={stream.id}
                stream={stream}
                onExpand={() => onExpandedChange(stream.id)}
                onStopViewing={(id) => setHidden((prev) => new Set(prev).add(id))}
              />
            ))}
          </div>
        )}

        {hidden.size > 0 && (
          <button
            type="button"
            onClick={() => setHidden(new Set())}
            className="btn-secondary btn-sm mt-3 w-full"
          >
            Tampilkan kembali {hidden.size} siaran
          </button>
        )}
      </div>

      <Modal
        open={expanded != null}
        onClose={() => onExpandedChange(null)}
        title={expanded?.officer.fullName ?? 'Siaran'}
        subtitle={expanded ? `${expanded.officer.unitName ?? 'Tanpa unit'} · siaran langsung` : ''}
        width="max-w-4xl"
      >
        {expanded && (
          <StreamTile
            stream={expanded}
            onStopViewing={() => onExpandedChange(null)}
            large
          />
        )}
      </Modal>
    </section>
  );
}
