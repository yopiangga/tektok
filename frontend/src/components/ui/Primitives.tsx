import { Inbox, Loader2, X } from 'lucide-react';
import { useEffect } from 'react';
import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { cx, initials } from '../../lib/format';

/* ---------------------------------------------------------------- Card ---- */

export function Card({
  title,
  icon,
  actions,
  children,
  className,
  bodyClassName,
}: {
  title?: ReactNode;
  icon?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section className={cx('card flex min-h-0 flex-col', className)}>
      {(title || actions) && (
        <header className="card-header">
          <h2 className="card-title">
            {icon}
            {title}
          </h2>
          {actions && <div className="flex items-center gap-2">{actions}</div>}
        </header>
      )}
      <div className={cx('min-h-0 flex-1', bodyClassName)}>{children}</div>
    </section>
  );
}

/* ---------------------------------------------------------------- Chip ---- */

export function Chip({
  tone = 'neutral',
  className,
  children,
}: {
  tone?: 'neutral' | 'accent' | 'success' | 'warning' | 'danger';
  className?: string;
  children: ReactNode;
}) {
  const tones = {
    neutral: 'bg-canvas-sunken text-ink-muted',
    accent: 'bg-accent-soft text-accent-strong',
    success: 'bg-success-soft text-success-strong',
    warning: 'bg-warning-soft text-warning-strong',
    danger: 'bg-danger-soft text-danger-strong',
  } as const;

  return <span className={cx('chip', tones[tone], className)}>{children}</span>;
}

/* ------------------------------------------------------------ StatusDot ---- */

export function StatusDot({ color, pulse = false }: { color: string; pulse?: boolean }) {
  return (
    <span className="relative inline-flex h-2.5 w-2.5 shrink-0">
      {pulse && (
        <span
          className="absolute inline-flex h-full w-full animate-pulse-ring rounded-full"
          style={{ backgroundColor: color }}
        />
      )}
      <span
        className="relative inline-flex h-2.5 w-2.5 rounded-full ring-2 ring-white"
        style={{ backgroundColor: color }}
      />
    </span>
  );
}

/* --------------------------------------------------------------- Avatar ---- */

export function Avatar({
  name,
  src,
  size = 36,
  color = '#2563EB',
}: {
  name: string;
  src?: string | null;
  size?: number;
  color?: string;
}) {
  if (src) {
    return (
      <img
        src={src}
        alt={name}
        width={size}
        height={size}
        className="shrink-0 rounded-full border border-line object-cover"
        style={{ width: size, height: size }}
      />
    );
  }

  return (
    <span
      className="grid shrink-0 place-items-center rounded-full font-semibold text-white"
      style={{
        width: size,
        height: size,
        backgroundColor: color,
        fontSize: Math.max(11, size * 0.36),
      }}
      aria-hidden
    >
      {initials(name)}
    </span>
  );
}

/* ----------------------------------------------------------- EmptyState ---- */

export function EmptyState({
  icon = <Inbox size={22} />,
  title,
  hint,
}: {
  icon?: ReactNode;
  title: string;
  hint?: string;
}) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 px-6 py-10 text-center">
      <div className="grid h-11 w-11 place-items-center rounded-full bg-canvas-sunken text-ink-faint">
        {icon}
      </div>
      <p className="text-sm font-medium text-ink-soft">{title}</p>
      {hint && <p className="max-w-xs text-xs text-ink-muted">{hint}</p>}
    </div>
  );
}

/* -------------------------------------------------------------- Spinner ---- */

export function Spinner({ size = 18, className }: { size?: number; className?: string }) {
  return <Loader2 size={size} className={cx('animate-spin', className)} />;
}

export function PanelLoading({ label = 'Memuat data…' }: { label?: string }) {
  return (
    <div className="flex h-full items-center justify-center gap-2 py-10 text-sm text-ink-muted">
      <Spinner /> {label}
    </div>
  );
}

/* ---------------------------------------------------------------- Modal ---- */

export function Modal({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
  width = 'max-w-lg',
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  subtitle?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  width?: string;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-[1000] flex items-end justify-center p-0 sm:items-center sm:p-6">
      <div
        className="absolute inset-0 bg-ink/25 backdrop-blur-[2px]"
        onClick={onClose}
        aria-hidden
      />
      <div
        role="dialog"
        aria-modal="true"
        className={cx(
          'relative flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-2xl bg-canvas-raised shadow-lift animate-slide-up sm:rounded-2xl',
          width
        )}
      >
        <header className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
          <div className="min-w-0">
            <h3 className="truncate text-base font-semibold text-ink">{title}</h3>
            {subtitle && <p className="mt-0.5 truncate text-xs text-ink-muted">{subtitle}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-ink-muted transition-colors hover:bg-canvas-sunken hover:text-ink"
            aria-label="Tutup"
          >
            <X size={18} />
          </button>
        </header>

        <div className="panel-scroll flex-1 px-5 py-4">{children}</div>

        {footer && (
          <footer className="flex items-center justify-end gap-2 border-t border-line bg-canvas px-5 py-3">
            {footer}
          </footer>
        )}
      </div>
    </div>,
    document.body
  );
}
