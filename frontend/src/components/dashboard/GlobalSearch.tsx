import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, FileText, Search, Target, Users, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { api } from '../../lib/api';
import { cx } from '../../lib/format';
import { Spinner } from '../ui/Primitives';

interface SearchHit {
  id: number;
  label: string;
  sub: string;
  status?: string;
}

interface SearchResults {
  personnel: SearchHit[];
  missions: SearchHit[];
  incidents: SearchHit[];
  reports: SearchHit[];
}

const GROUPS: Array<{
  key: keyof SearchResults;
  label: string;
  icon: typeof Users;
  tone: string;
}> = [
  { key: 'personnel', label: 'Personel', icon: Users, tone: 'text-accent' },
  { key: 'missions', label: 'Misi', icon: Target, tone: 'text-success' },
  { key: 'incidents', label: 'Insiden', icon: AlertTriangle, tone: 'text-danger' },
  { key: 'reports', label: 'Laporan', icon: FileText, tone: 'text-warning' },
];

export default function GlobalSearch() {
  const [term, setTerm] = useState('');
  const [debounced, setDebounced] = useState('');
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const id = setTimeout(() => setDebounced(term.trim()), 250);
    return () => clearTimeout(id);
  }, [term]);

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (!boxRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      // Ctrl/⌘+K focuses search — "minimal clicks" from the design principles.
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        inputRef.current?.focus();
        setOpen(true);
      }
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, []);

  const { data, isFetching } = useQuery({
    queryKey: ['search', debounced],
    enabled: debounced.length >= 2,
    staleTime: 10_000,
    queryFn: async () => {
      const { data } = await api.get<{ results: SearchResults }>('/dashboard/search', {
        params: { q: debounced },
      });
      return data.results;
    },
  });

  const total = data ? GROUPS.reduce((sum, g) => sum + (data[g.key]?.length ?? 0), 0) : 0;

  return (
    <div className="relative mx-auto max-w-xl" ref={boxRef}>
      <div className="relative">
        <Search
          size={16}
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint"
        />
        <input
          ref={inputRef}
          value={term}
          onChange={(e) => {
            setTerm(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          placeholder="Cari personel, misi, insiden, laporan…"
          className="field h-10 pl-9 pr-16"
          aria-label="Pencarian global"
        />
        {term ? (
          <button
            type="button"
            onClick={() => {
              setTerm('');
              inputRef.current?.focus();
            }}
            className="absolute right-2 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-md text-ink-faint hover:bg-canvas-sunken hover:text-ink-soft"
            aria-label="Bersihkan pencarian"
          >
            <X size={15} />
          </button>
        ) : (
          <kbd className="pointer-events-none absolute right-2.5 top-1/2 hidden -translate-y-1/2 rounded border border-line bg-canvas px-1.5 py-0.5 font-mono text-[10px] text-ink-faint lg:block">
            ⌘K
          </kbd>
        )}
      </div>

      {open && debounced.length >= 2 && (
        <div className="absolute left-0 right-0 top-[calc(100%+8px)] z-50 max-h-[70vh] overflow-y-auto rounded-xl border border-line bg-canvas-raised shadow-lift animate-slide-up">
          {isFetching && !data ? (
            <div className="flex items-center justify-center gap-2 px-4 py-6 text-sm text-ink-muted">
              <Spinner /> Mencari…
            </div>
          ) : total === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-ink-muted">
              Tidak ada hasil untuk “{debounced}”
            </p>
          ) : (
            GROUPS.map(({ key, label, icon: Icon, tone }) => {
              const hits = data?.[key] ?? [];
              if (!hits.length) return null;
              return (
                <div key={key} className="border-b border-line last:border-b-0">
                  <p className="px-4 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-wide text-ink-faint">
                    {label}
                  </p>
                  {hits.map((hit) => (
                    <button
                      key={`${key}-${hit.id}`}
                      type="button"
                      onClick={() => {
                        setOpen(false);
                        window.dispatchEvent(
                          new CustomEvent('tocs:search-select', { detail: { type: key, id: hit.id } })
                        );
                      }}
                      className="flex w-full items-center gap-3 px-4 py-2 text-left transition-colors hover:bg-accent-soft"
                    >
                      <Icon size={16} className={cx('shrink-0', tone)} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-ink">
                          {hit.label}
                        </span>
                        <span className="block truncate text-xs text-ink-muted">{hit.sub}</span>
                      </span>
                    </button>
                  ))}
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
