import { useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  Eye,
  EyeOff,
  Maximize2,
  Minimize2,
  Pin,
  PinOff,
  Radio,
  VideoOff,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { PartnerLogo, PartnerMark, PartnerWatermark } from '../components/ui/PartnerBrand';
import { EmptyState, PanelLoading } from '../components/ui/Primitives';
import { useHiddenStreams } from '../hooks/useHiddenStreams';
import { useLiveStreams } from '../hooks/useLiveStreams';
import { useSocketEvent } from '../hooks/useSocketEvent';
import { useStreamSubscription } from '../hooks/useStreamSubscription';
import { BRAND, BRAND_VERSION, PARTNER_BRAND } from '../lib/brand';
import { cx, duration } from '../lib/format';
import type { Quality } from '../lib/livekit';
import type { Stream } from '../lib/types';

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

const PIN_STORAGE_KEY = 'tocs.pinnedStreams';

/**
 * Dedicated streaming wall.
 *
 * The dashboard panel is a glanceable corner of a busy screen; this page is for
 * actually watching. Three landscape tiles per row keep each frame large enough
 * to read a scene, pinning holds the streams an operator is tracking at the
 * front as others come and go, and highlight promotes one to a full-width stage.
 */
export default function Streams() {
  const queryClient = useQueryClient();

  const [pinned, setPinned] = useState<number[]>(() => {
    try {
      const raw = localStorage.getItem(PIN_STORAGE_KEY);
      return raw ? (JSON.parse(raw) as number[]) : [];
    } catch {
      return [];
    }
  });
  const [highlighted, setHighlighted] = useState<number | null>(null);
  // Audio is per stream, as requested. Everything starts muted — a wall of
  // simultaneously audible streams is unusable in a command room.
  const [unmuted, setUnmuted] = useState<number[]>([]);

  useEffect(() => {
    localStorage.setItem(PIN_STORAGE_KEY, JSON.stringify(pinned));
  }, [pinned]);

  const streams = useLiveStreams();
  const { hidden, hide, showAll, prune } = useHiddenStreams();

  const refresh = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ['streams'] });
  }, [queryClient]);

  useSocketEvent('stream_started', refresh);
  useSocketEvent('stream_stopped', refresh);

  const all = useMemo(() => streams.data ?? [], [streams.data]);

  // Siaran yang disembunyikan tetap berjalan dan tetap dihitung "aktif"; yang
  // hilang hanya ubinnya dari dinding ini. Membuang mereka lebih dulu berarti
  // sematan, highlight, dan audio hanya pernah menyangkut siaran yang tampil.
  const live = useMemo(() => all.filter((s) => !hidden.includes(s.id)), [all, hidden]);

  // Dihitung dari siaran yang benar-benar aktif, bukan panjang daftar simpanan,
  // supaya sesi yang sudah berakhir tidak pernah ikut terhitung.
  const hiddenCount = all.length - live.length;

  // Id sesi yang sudah berakhir tidak perlu disimpan lagi.
  useEffect(() => {
    if (streams.isSuccess) prune(all.map((s) => s.id));
  }, [streams.isSuccess, all, prune]);

  // Pinned first, then newest — so a tracked stream never jumps position when
  // another operator starts broadcasting.
  const ordered = useMemo(() => {
    const rank = (s: Stream) => (pinned.includes(s.id) ? 0 : 1);
    return [...live].sort(
      (a, b) => rank(a) - rank(b) || +new Date(b.startedAt) - +new Date(a.startedAt)
    );
  }, [live, pinned]);

  const stage = highlighted != null ? live.find((s) => s.id === highlighted) : undefined;
  const rest = stage ? ordered.filter((s) => s.id !== stage.id) : ordered;

  // A stream that ends while highlighted must not leave an empty stage.
  useEffect(() => {
    if (highlighted != null && !live.some((s) => s.id === highlighted)) setHighlighted(null);
  }, [live, highlighted]);

  const toggle = (list: number[], id: number) =>
    list.includes(id) ? list.filter((x) => x !== id) : [...list, id];

  return (
    <div className="flex min-h-screen flex-col bg-canvas">
      <header className="sticky top-0 z-30 border-b border-line bg-canvas-raised/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-[110rem] items-center gap-3 px-4 lg:px-6">
          <Link
            to="/dashboard"
            className="grid h-9 w-9 place-items-center rounded-lg border border-line text-ink-soft transition-colors hover:bg-canvas-sunken"
            aria-label="Kembali ke dashboard"
          >
            <ArrowLeft size={18} />
          </Link>

          {/* Muncul begitu berkas logo tersedia; sampai itu brand dibawa oleh
              judul berwarna di sebelahnya. */}
          <PartnerLogo height={30} className="hidden sm:block" />

          <div className="min-w-0 flex-1">
            <h1 className="flex flex-wrap items-center gap-x-2 text-sm font-semibold text-ink">
              <Radio size={16} className="shrink-0 text-danger" />
              <span>
                Siaran Langsung <span className="text-kn">{PARTNER_BRAND}</span>
              </span>
              <span className="rounded-full bg-danger-soft px-2 py-0.5 text-[11px] font-medium text-danger-strong">
                {all.length} aktif
              </span>
            </h1>
            <p className="truncate text-xs text-ink-muted">
              {pinned.length > 0 && `${pinned.length} disematkan · `}
              {hiddenCount > 0 && `${hiddenCount} disembunyikan · `}
              {unmuted.length > 0 ? `${unmuted.length} audio menyala` : 'semua audio bisu'}
            </p>
          </div>

          {hiddenCount > 0 && (
            <button type="button" className="btn-secondary btn-sm" onClick={showAll}>
              <Eye size={14} />
              Tampilkan {hiddenCount} tersembunyi
            </button>
          )}

          <button
            type="button"
            className="btn-secondary btn-sm"
            onClick={() => setUnmuted([])}
            disabled={unmuted.length === 0}
          >
            <VolumeX size={14} />
            Bisukan semua
          </button>

          {highlighted != null && (
            <button type="button" className="btn-secondary btn-sm" onClick={() => setHighlighted(null)}>
              <Minimize2 size={14} />
              Keluar highlight
            </button>
          )}
        </div>
      </header>

      <main className="mx-auto w-full max-w-[110rem] flex-1 space-y-4 px-4 py-4 lg:px-6">
        {streams.isLoading ? (
          <PanelLoading label="Memuat siaran…" />
        ) : live.length === 0 ? (
          <div className="card py-16">
            <EmptyState
              icon={hiddenCount > 0 ? <EyeOff size={22} /> : <VideoOff size={22} />}
              title={hiddenCount > 0 ? 'Semua siaran disembunyikan' : 'Tidak ada siaran aktif'}
              hint={
                hiddenCount > 0
                  ? `${hiddenCount} siaran aktif sedang Anda sembunyikan. Gunakan tombol "Tampilkan tersembunyi" di atas untuk memunculkannya kembali.`
                  : 'Siaran muncul otomatis saat personel menekan MULAI SIARAN di aplikasi lapangan.'
              }
            />
          </div>
        ) : (
          <>
            {/* Highlight stage */}
            {stage && (
              <section className="grid gap-4 xl:grid-cols-[3fr_1fr]">
                <StreamCard
                  stream={stage}
                  stage
                  pinned={pinned.includes(stage.id)}
                  muted={!unmuted.includes(stage.id)}
                  highlighted
                  onPin={() => setPinned((p) => toggle(p, stage.id))}
                  onMute={() => setUnmuted((m) => toggle(m, stage.id))}
                  onHighlight={() => setHighlighted(null)}
                  onHide={() => hide(stage.id)}
                />

                {/* Sidebar keeps the rest watchable while one is on stage. */}
                <div className="grid max-h-[70vh] gap-3 overflow-y-auto pr-1 xl:grid-cols-1">
                  {rest.map((s) => (
                    <StreamCard
                      key={s.id}
                      stream={s}
                      compact
                      pinned={pinned.includes(s.id)}
                      muted={!unmuted.includes(s.id)}
                      onPin={() => setPinned((p) => toggle(p, s.id))}
                      onMute={() => setUnmuted((m) => toggle(m, s.id))}
                      onHighlight={() => setHighlighted(s.id)}
                      onHide={() => hide(s.id)}
                    />
                  ))}
                </div>
              </section>
            )}

            {/* Three landscape tiles per row */}
            {!stage && (
              <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {ordered.map((s) => (
                  <StreamCard
                    key={s.id}
                    stream={s}
                    pinned={pinned.includes(s.id)}
                    muted={!unmuted.includes(s.id)}
                    onPin={() => setPinned((p) => toggle(p, s.id))}
                    onMute={() => setUnmuted((m) => toggle(m, s.id))}
                    onHighlight={() => setHighlighted(s.id)}
                    onHide={() => hide(s.id)}
                  />
                ))}
              </section>
            )}
          </>
        )}
      </main>

      {/* Dinding ini sering diproyeksikan di ruang komando, jadi brand tetap
          terbaca bahkan saat belum ada satu pun siaran yang tampil. */}
      <footer className="border-t border-line bg-canvas-raised px-4 py-2.5 lg:px-6">
        <div className="mx-auto flex max-w-[110rem] flex-wrap items-center gap-x-3 gap-y-1">
          <PartnerMark height={24} textClassName="text-[9px]" />
          <p className="text-[11px] text-ink-muted">Siaran Langsung {PARTNER_BRAND}</p>
          <span className="ml-auto text-[11px] text-ink-faint">
            dipantau dari {BRAND} {BRAND_VERSION}
          </span>
        </div>
      </footer>
    </div>
  );
}

/* --------------------------------------------------------------- card ----- */

function StreamCard({
  stream,
  pinned,
  muted,
  stage = false,
  compact = false,
  highlighted = false,
  onPin,
  onMute,
  onHighlight,
  onHide,
}: {
  stream: Stream;
  pinned: boolean;
  muted: boolean;
  stage?: boolean;
  compact?: boolean;
  highlighted?: boolean;
  onPin: () => void;
  onMute: () => void;
  onHighlight: () => void;
  onHide: () => void;
}) {
  // The stage view is large, so it asks for the top simulcast layer; grid tiles
  // stay adaptive to keep many concurrent streams affordable.
  const { videoRef, state, quality } = useStreamSubscription(stream.id, stream.roomName, {
    highQuality: stage,
    initialQuality: stream.quality,
  });

  const [elapsed, setElapsed] = useState(() => duration(stream.startedAt));
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
    <article
      className={cx(
        'group relative overflow-hidden rounded-xl border bg-ink',
        pinned ? 'border-accent ring-1 ring-accent/40' : 'border-line'
      )}
    >
      <div className="relative aspect-video w-full">
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
                <Radio size={22} className="animate-pulse" />
                <p className="text-xs">Menghubungkan…</p>
              </>
            )}
            {state === 'waiting' && (
              <>
                <Radio size={22} className="animate-pulse text-warning" />
                <p className="text-xs">Menunggu sinyal kamera…</p>
              </>
            )}
            {state === 'preview-only' && (
              <>
                <VideoOff size={22} className="text-warning" />
                <p className="px-4 text-center text-[11px]">Server streaming tidak terjangkau.</p>
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

        {/* Bug brand di dalam frame. Dilewati pada ubin samping yang mungil:
            di sana pil ini akan menutupi sebagian gambar, bukan menandainya. */}
        {!compact && <PartnerWatermark className="bottom-14 right-3" />}

        {/* Who is streaming, and from where */}
        <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-2 bg-gradient-to-b from-ink/85 to-transparent p-3">
          <div className="min-w-0">
            <p
              className={cx(
                'truncate font-semibold text-white',
                stage ? 'text-base' : compact ? 'text-[11px]' : 'text-sm'
              )}
            >
              {stream.officer.fullName}
            </p>
            <p className="truncate text-[10px] text-white/70">
              {stream.officer.unitName ?? 'Tanpa unit'} · {stream.officer.badgeNumber ?? '—'}
            </p>
          </div>

          <div className="flex shrink-0 items-center gap-1">
            {pinned && (
              <span className="rounded-md bg-accent px-1.5 py-0.5 text-[10px] font-bold text-white">
                PIN
              </span>
            )}
            <span
              className={cx(
                'flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-bold text-white',
                state === 'live' ? 'bg-danger' : 'bg-white/25 backdrop-blur'
              )}
            >
              <span
                className={cx('h-1.5 w-1.5 rounded-full bg-white', state === 'live' && 'animate-pulse')}
              />
              {state === 'live' ? 'LIVE' : 'MENUNGGU'}
            </span>
          </div>
        </div>

        {/* Status + controls */}
        <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-2 bg-gradient-to-t from-ink/90 to-transparent p-3">
          <div className="flex items-center gap-2 text-[10px] text-white/85">
            <span className="font-mono tabular-nums">{elapsed}</span>
            <span className="flex items-center gap-1">
              <span className={cx('h-1.5 w-1.5 rounded-full', QUALITY_TONE[quality])} />
              {QUALITY_LABEL[quality]}
            </span>
            {!muted && (
              <span className="flex items-center gap-1 rounded bg-success/80 px-1.5 py-0.5 font-semibold text-white">
                <Volume2 size={10} /> AUDIO
              </span>
            )}
          </div>

          {/* Always visible: on a wall you should not have to hunt for controls. */}
          <div className="flex items-center gap-1">
            <ControlButton
              onClick={onMute}
              active={!muted}
              title={muted ? 'Nyalakan audio' : 'Bisukan audio'}
            >
              {muted ? <VolumeX size={14} /> : <Volume2 size={14} />}
            </ControlButton>

            <ControlButton onClick={onPin} active={pinned} title={pinned ? 'Lepas sematan' : 'Sematkan'}>
              {pinned ? <PinOff size={14} /> : <Pin size={14} />}
            </ControlButton>

            <ControlButton
              onClick={onHighlight}
              active={highlighted}
              title={highlighted ? 'Keluar dari highlight' : 'Jadikan highlight'}
            >
              {highlighted ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
            </ControlButton>

            <ControlButton
              onClick={onHide}
              active={false}
              title={`Sembunyikan siaran ${stream.officer.fullName}`}
            >
              <EyeOff size={14} />
            </ControlButton>
          </div>
        </div>
      </div>
    </article>
  );
}

function ControlButton({
  onClick,
  active,
  title,
  children,
}: {
  onClick: () => void;
  active: boolean;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-label={title}
      aria-pressed={active}
      className={cx(
        'grid h-8 w-8 place-items-center rounded-md text-white backdrop-blur transition-colors',
        active ? 'bg-accent hover:bg-accent-strong' : 'bg-white/15 hover:bg-white/30'
      )}
    >
      {children}
    </button>
  );
}
