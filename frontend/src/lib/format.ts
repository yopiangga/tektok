import type { PresenceStatus, Priority } from './types';

const timeFmt = new Intl.DateTimeFormat('id-ID', {
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

const dateTimeFmt = new Intl.DateTimeFormat('id-ID', {
  day: '2-digit',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

export const formatTime = (value: string | Date | null | undefined) =>
  value ? timeFmt.format(new Date(value)) : '—';

export const formatDateTime = (value: string | Date | null | undefined) =>
  value ? dateTimeFmt.format(new Date(value)) : '—';

/** "baru saja" / "3 mnt" / "2 jam" — compact enough for dense tables. */
export function timeAgo(value: string | Date | null | undefined): string {
  if (!value) return '—';
  const seconds = Math.floor((Date.now() - new Date(value).getTime()) / 1000);
  if (seconds < 10) return 'baru saja';
  if (seconds < 60) return `${seconds} dtk`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} mnt`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} jam`;
  return `${Math.floor(hours / 24)} hr`;
}

export function duration(from: string | Date): string {
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(from).getTime()) / 1000));
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

export const STATUS_LABEL: Record<PresenceStatus, string> = {
  online: 'Online',
  idle: 'Idle',
  offline: 'Offline',
};

/** Marker + badge colours, straight from the blueprint legend. */
export const STATUS_COLOR: Record<PresenceStatus, string> = {
  online: '#10B981',
  idle: '#F59E0B',
  offline: '#EF4444',
};

export const STATUS_CHIP: Record<PresenceStatus, string> = {
  online: 'bg-success-soft text-success-strong',
  idle: 'bg-warning-soft text-warning-strong',
  offline: 'bg-danger-soft text-danger-strong',
};

export const PRIORITY_LABEL: Record<Priority, string> = {
  low: 'Rendah',
  medium: 'Sedang',
  high: 'Tinggi',
  critical: 'Kritis',
};

export const PRIORITY_CHIP: Record<Priority, string> = {
  low: 'bg-canvas-sunken text-ink-muted',
  medium: 'bg-accent-soft text-accent-strong',
  high: 'bg-warning-soft text-warning-strong',
  critical: 'bg-danger-soft text-danger-strong',
};

export const MISSION_STATUS_LABEL: Record<string, string> = {
  pending: 'Menunggu',
  running: 'Berjalan',
  completed: 'Selesai',
  cancelled: 'Dibatalkan',
};

export const MISSION_STATUS_CHIP: Record<string, string> = {
  pending: 'bg-warning-soft text-warning-strong',
  running: 'bg-accent-soft text-accent-strong',
  completed: 'bg-success-soft text-success-strong',
  cancelled: 'bg-canvas-sunken text-ink-muted',
};

export const INCIDENT_STATUS_LABEL: Record<string, string> = {
  open: 'Terbuka',
  investigating: 'Ditangani',
  closed: 'Ditutup',
};

export const INCIDENT_STATUS_CHIP: Record<string, string> = {
  open: 'bg-danger-soft text-danger-strong',
  investigating: 'bg-warning-soft text-warning-strong',
  closed: 'bg-canvas-sunken text-ink-muted',
};

export const REPORT_TYPE_LABEL: Record<string, string> = {
  information: 'Informasi',
  incident: 'Insiden',
  request_help: 'Permintaan Bantuan',
};

export function batteryTone(level: number | null | undefined): string {
  if (level == null) return 'text-ink-faint';
  if (level <= 20) return 'text-danger';
  if (level <= 50) return 'text-warning';
  return 'text-success';
}

export function signalBars(level: number | null | undefined): number {
  if (level == null) return 0;
  return Math.min(4, Math.max(0, Math.ceil(level / 25)));
}

export function initials(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

export const cx = (...values: Array<string | false | null | undefined>) =>
  values.filter(Boolean).join(' ');
