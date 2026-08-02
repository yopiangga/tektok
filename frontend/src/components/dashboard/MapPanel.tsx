import L from 'leaflet';
import {
  AlertTriangle,
  Crosshair,
  FileText,
  Layers,
  Map as MapIcon,
  Search,
  Target,
  Users,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { MapContainer, Marker, Popup, TileLayer, useMap } from 'react-leaflet';
import { STATUS_COLOR, STATUS_LABEL, cx, timeAgo } from '../../lib/format';
import type { MapData, Operation, PresenceStatus } from '../../lib/types';
import { PanelLoading } from '../ui/Primitives';

/** Marker legend from the blueprint. */
const LAYER_META = {
  personnel: { label: 'Personel', color: '#10B981', icon: Users },
  incidents: { label: 'Insiden', color: '#2563EB', icon: AlertTriangle },
  reports: { label: 'Laporan', color: '#F59E0B', icon: FileText },
  missions: { label: 'Misi', color: '#8B5CF6', icon: Target },
} as const;

type LayerKey = keyof typeof LAYER_META;

function dotIcon(color: string, options: { pulse?: boolean; size?: number } = {}) {
  const size = options.size ?? 16;
  return L.divIcon({
    className: 'tocs-divicon',
    html: `<span style="
      display:block;width:${size}px;height:${size}px;border-radius:9999px;
      background:${color};border:2.5px solid #fff;
      box-shadow:0 1px 3px rgba(15,23,42,.35);
      ${options.pulse ? 'animation:tocs-blip 2s infinite;' : ''}
    "></span>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    popupAnchor: [0, -size / 2],
  });
}

function squareIcon(color: string) {
  return L.divIcon({
    className: 'tocs-divicon',
    html: `<span style="
      display:block;width:14px;height:14px;border-radius:4px;
      background:${color};border:2.5px solid #fff;
      box-shadow:0 1px 3px rgba(15,23,42,.35);transform:rotate(45deg);
    "></span>`,
    iconSize: [14, 14],
    iconAnchor: [7, 7],
    popupAnchor: [0, -8],
  });
}

/** Bridges imperative Leaflet calls (fly-to, resize) into React state. */
function MapController({ focus }: { focus: { lat: number; lng: number; zoom?: number } | null }) {
  const map = useMap();

  useEffect(() => {
    if (focus) map.flyTo([focus.lat, focus.lng], focus.zoom ?? 16, { duration: 0.8 });
  }, [focus, map]);

  // The map mounts inside a flex/grid panel whose height settles after Leaflet
  // measures it, so markers land off-screen without an explicit resize pass.
  useEffect(() => {
    const container = map.getContainer();
    const invalidate = () => map.invalidateSize({ animate: false });

    const raf = requestAnimationFrame(invalidate);
    const observer = new ResizeObserver(invalidate);
    observer.observe(container);

    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
    };
  }, [map]);

  return null;
}

export default function MapPanel({
  data,
  operation,
  loading,
  onSelectPersonnel,
}: {
  data?: MapData;
  operation?: Operation | null;
  loading: boolean;
  onSelectPersonnel: (id: number) => void;
}) {
  const [layers, setLayers] = useState<Record<LayerKey, boolean>>({
    personnel: true,
    incidents: true,
    reports: true,
    missions: true,
  });
  const [statusFilter, setStatusFilter] = useState<PresenceStatus | 'all'>('all');
  const [term, setTerm] = useState('');
  const [focus, setFocus] = useState<{ lat: number; lng: number; zoom?: number } | null>(null);
  const [showLayerMenu, setShowLayerMenu] = useState(false);
  const layerMenuRef = useRef<HTMLDivElement>(null);

  const center = useMemo<[number, number]>(
    () => [operation?.center.lat ?? -6.2088, operation?.center.lng ?? 106.8456],
    [operation]
  );

  useEffect(() => {
    const onLocate = (event: Event) => {
      const detail = (event as CustomEvent<{ lat: number; lng: number }>).detail;
      if (detail) setFocus({ ...detail, zoom: 17 });
    };
    window.addEventListener('tocs:locate', onLocate);
    return () => window.removeEventListener('tocs:locate', onLocate);
  }, []);

  useEffect(() => {
    if (!showLayerMenu) return;
    const onClick = (event: MouseEvent) => {
      if (!layerMenuRef.current?.contains(event.target as Node)) setShowLayerMenu(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [showLayerMenu]);

  const personnel = useMemo(() => {
    const list = data?.personnel ?? [];
    const q = term.trim().toLowerCase();
    return list.filter(
      (p) =>
        (statusFilter === 'all' || p.status === statusFilter) &&
        (!q || p.fullName.toLowerCase().includes(q) || (p.unitName ?? '').toLowerCase().includes(q))
    );
  }, [data, statusFilter, term]);

  const counts = {
    personnel: personnel.length,
    incidents: data?.incidents.length ?? 0,
    reports: data?.reports.length ?? 0,
    missions: data?.missions.length ?? 0,
  };

  return (
    <section className="card relative flex h-full min-h-[420px] flex-col overflow-hidden">
      <header className="card-header">
        <h2 className="card-title">
          <MapIcon size={16} className="text-accent" />
          Peta Operasi
          <span className="ml-1 rounded-full bg-canvas-sunken px-2 py-0.5 text-[11px] font-medium text-ink-muted">
            {counts.personnel} personel
          </span>
        </h2>

        <div className="flex items-center gap-2">
          <div className="relative hidden sm:block">
            <Search
              size={14}
              className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-faint"
            />
            <input
              value={term}
              onChange={(e) => setTerm(e.target.value)}
              placeholder="Cari di peta…"
              className="field h-8 w-40 pl-8 text-xs lg:w-52"
              aria-label="Cari personel pada peta"
            />
          </div>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as PresenceStatus | 'all')}
            className="field h-8 w-auto py-0 text-xs"
            aria-label="Filter status personel"
          >
            <option value="all">Semua status</option>
            <option value="online">Online</option>
            <option value="idle">Idle</option>
            <option value="offline">Offline</option>
          </select>

          <div className="relative" ref={layerMenuRef}>
            <button
              type="button"
              onClick={() => setShowLayerMenu((v) => !v)}
              className="btn-secondary btn-sm"
              aria-expanded={showLayerMenu}
            >
              <Layers size={14} />
              <span className="hidden lg:inline">Layer</span>
            </button>

            {showLayerMenu && (
              <div className="absolute right-0 top-[calc(100%+6px)] z-[500] w-52 overflow-hidden rounded-xl border border-line bg-canvas-raised p-1.5 shadow-lift animate-slide-up">
                {(Object.keys(LAYER_META) as LayerKey[]).map((key) => {
                  const meta = LAYER_META[key];
                  return (
                    <label
                      key={key}
                      className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition-colors hover:bg-canvas-sunken"
                    >
                      <input
                        type="checkbox"
                        checked={layers[key]}
                        onChange={(e) => setLayers((prev) => ({ ...prev, [key]: e.target.checked }))}
                        className="h-4 w-4 rounded border-line-strong text-accent focus:ring-accent/30"
                      />
                      <span
                        className="h-2.5 w-2.5 rounded-full"
                        style={{ backgroundColor: meta.color }}
                      />
                      <span className="flex-1 text-ink-soft">{meta.label}</span>
                      <span className="text-xs tabular-nums text-ink-faint">{counts[key]}</span>
                    </label>
                  );
                })}
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={() => setFocus({ lat: center[0], lng: center[1], zoom: 13 })}
            className="btn-secondary btn-sm"
            title="Kembali ke pusat operasi"
          >
            <Crosshair size={14} />
          </button>
        </div>
      </header>

      <div className="relative min-h-0 flex-1">
        {loading && !data ? (
          <PanelLoading label="Memuat peta…" />
        ) : (
          /* Absolute fill rather than h-full: a percentage height against a
             flex item collapses to 0 before Leaflet measures the container. */
          <MapContainer
            center={center}
            zoom={13}
            scrollWheelZoom
            className="absolute inset-0"
            preferCanvas
          >
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
              url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
            />
            <MapController focus={focus} />

            {layers.personnel &&
              personnel.map((p) => (
                <Marker
                  key={`p-${p.id}`}
                  position={[p.lat, p.lng]}
                  icon={dotIcon(STATUS_COLOR[p.status], { pulse: p.streaming })}
                >
                  <Popup>
                    <div className="min-w-[190px] p-3">
                      <p className="text-sm font-semibold text-ink">{p.fullName}</p>
                      <p className="mt-0.5 text-xs text-ink-muted">
                        {p.unitName ?? 'Tanpa unit'} · {STATUS_LABEL[p.status]}
                      </p>
                      <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                        <dt className="text-ink-faint">Baterai</dt>
                        <dd className="text-right font-medium text-ink">{p.battery ?? '—'}%</dd>
                        <dt className="text-ink-faint">Update</dt>
                        <dd className="text-right font-medium text-ink">{timeAgo(p.lastSeenAt)}</dd>
                      </dl>
                      {p.streaming && (
                        <p className="mt-2 rounded-md bg-danger-soft px-2 py-1 text-[11px] font-semibold text-danger-strong">
                          ● Sedang siaran langsung
                        </p>
                      )}
                      <button
                        type="button"
                        onClick={() => onSelectPersonnel(p.id)}
                        className="btn-primary btn-sm mt-2.5 w-full"
                      >
                        Buka detail
                      </button>
                    </div>
                  </Popup>
                </Marker>
              ))}

            {layers.incidents &&
              (data?.incidents ?? []).map((i) => (
                <Marker
                  key={`i-${i.id}`}
                  position={[i.lat, i.lng]}
                  icon={squareIcon(LAYER_META.incidents.color)}
                >
                  <Popup>
                    <div className="min-w-[180px] p-3">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-accent">
                        Insiden
                      </p>
                      <p className="mt-1 text-sm font-semibold text-ink">{i.title}</p>
                      <p className="mt-0.5 text-xs text-ink-muted">
                        {i.location ?? 'Lokasi tidak tercatat'}
                      </p>
                      <p className="mt-1.5 text-xs text-ink-muted">
                        Prioritas {i.priority} · {timeAgo(i.createdAt)} lalu
                      </p>
                    </div>
                  </Popup>
                </Marker>
              ))}

            {layers.reports &&
              (data?.reports ?? []).map((r) => (
                <Marker
                  key={`r-${r.id}`}
                  position={[r.lat, r.lng]}
                  icon={dotIcon(LAYER_META.reports.color, { size: 12 })}
                >
                  <Popup>
                    <div className="min-w-[180px] p-3">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-warning-strong">
                        Laporan
                      </p>
                      <p className="mt-1 text-sm font-semibold text-ink">
                        {r.title ?? `Laporan #${r.id}`}
                      </p>
                      <p className="mt-0.5 text-xs text-ink-muted">
                        {r.userName} · {timeAgo(r.createdAt)} lalu
                      </p>
                    </div>
                  </Popup>
                </Marker>
              ))}

            {layers.missions &&
              (data?.missions ?? []).map((m) => (
                <Marker
                  key={`m-${m.id}`}
                  position={[m.lat, m.lng]}
                  icon={squareIcon(LAYER_META.missions.color)}
                >
                  <Popup>
                    <div className="min-w-[180px] p-3">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-muted">
                        Misi
                      </p>
                      <p className="mt-1 text-sm font-semibold text-ink">{m.title}</p>
                      <p className="mt-0.5 text-xs text-ink-muted">
                        {m.status} · prioritas {m.priority}
                      </p>
                    </div>
                  </Popup>
                </Marker>
              ))}
          </MapContainer>
        )}

        {/* Legend */}
        <div className="pointer-events-none absolute bottom-3 left-3 z-[400] rounded-xl border border-line bg-canvas-raised/95 px-3 py-2 shadow-soft backdrop-blur">
          <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-ink-faint">
            Legenda
          </p>
          <ul className="grid grid-cols-2 gap-x-4 gap-y-1 text-[11px] text-ink-soft">
            {[
              ['Online', STATUS_COLOR.online],
              ['Idle', STATUS_COLOR.idle],
              ['Offline', STATUS_COLOR.offline],
              ['Insiden', LAYER_META.incidents.color],
              ['Laporan', LAYER_META.reports.color],
              ['Misi', LAYER_META.missions.color],
            ].map(([label, color]) => (
              <li key={label} className="flex items-center gap-1.5">
                <span
                  className={cx('h-2 w-2 rounded-full border border-white')}
                  style={{ backgroundColor: color }}
                />
                {label}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
