import { AlertCircle, Eye, EyeOff, Lock, ShieldCheck, User } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Spinner } from '../components/ui/Primitives';
import { BRAND, BRAND_TAGLINE } from '../lib/brand';
import { homeFor } from '../App';
import { useAuth } from '../store/auth';

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const user = await login(username.trim(), password);
      navigate(homeFor(user.role), { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal masuk ke sistem');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="grid min-h-screen lg:grid-cols-[1.1fr_1fr]">
      {/* Brand panel — hidden on mobile so the form stays one screen tall. */}
      <aside className="relative hidden overflow-hidden bg-ink px-12 py-14 lg:flex lg:flex-col lg:justify-between">
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.16]"
          style={{
            backgroundImage:
              'radial-gradient(circle at 20% 20%, #2563EB 0, transparent 45%), radial-gradient(circle at 80% 70%, #10B981 0, transparent 40%)',
          }}
        />
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.07]"
          style={{
            backgroundImage:
              'linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)',
            backgroundSize: '48px 48px',
          }}
        />

        <div className="relative flex items-center gap-3 text-white">
          <div className="grid h-11 w-11 place-items-center rounded-xl bg-accent shadow-lift">
            <ShieldCheck size={22} />
          </div>
          <div>
            <p className="text-sm font-bold tracking-[0.2em]">{BRAND}</p>
            <p className="text-xs text-white/60">{BRAND_TAGLINE}</p>
          </div>
        </div>

        <div className="relative max-w-md text-white">
          <h1 className="text-3xl font-bold leading-tight">
            Pantau, koordinasikan, dan dokumentasikan operasi lapangan secara real-time.
          </h1>
          <p className="mt-4 text-sm leading-relaxed text-white/70">
            Satu ruang komando untuk posisi personel, laporan lapangan, penugasan misi, penanganan
            insiden, dan siaran langsung.
          </p>

          <dl className="mt-10 grid grid-cols-3 gap-4 border-t border-white/15 pt-6">
            {[
              ['100', 'Personel aktif'],
              ['< 1s', 'Latensi realtime'],
              ['10', 'Siaran serentak'],
            ].map(([value, label]) => (
              <div key={label}>
                <dt className="text-2xl font-bold">{value}</dt>
                <dd className="mt-0.5 text-xs text-white/60">{label}</dd>
              </div>
            ))}
          </dl>
        </div>

        <p className="relative text-xs text-white/40">
          Akses terbatas · Seluruh aktivitas tercatat dalam audit log
        </p>
      </aside>

      {/* Form */}
      <main className="flex items-center justify-center bg-canvas px-5 py-10">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <div className="grid h-11 w-11 place-items-center rounded-xl bg-accent text-white shadow-soft">
              <ShieldCheck size={22} />
            </div>
            <div>
              <p className="text-sm font-bold tracking-[0.2em] text-ink">{BRAND}</p>
              <p className="text-xs text-ink-muted">{BRAND_TAGLINE}</p>
            </div>
          </div>

          <h2 className="text-2xl font-bold text-ink">Masuk ke sistem</h2>
          <p className="mt-1.5 text-sm text-ink-muted">
            Gunakan kredensial dinas yang telah diberikan komando.
          </p>

          <form onSubmit={onSubmit} className="mt-8 space-y-4" noValidate>
            <div>
              <label className="label" htmlFor="username">
                Username
              </label>
              <div className="relative">
                <User
                  size={16}
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint"
                />
                <input
                  id="username"
                  className="field h-11 pl-9"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="admin"
                  autoComplete="username"
                  autoFocus
                  required
                />
              </div>
            </div>

            <div>
              <label className="label" htmlFor="password">
                Password
              </label>
              <div className="relative">
                <Lock
                  size={16}
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint"
                />
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  className="field h-11 pl-9 pr-10"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  autoComplete="current-password"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-2 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-md text-ink-faint transition-colors hover:bg-canvas-sunken hover:text-ink-soft"
                  aria-label={showPassword ? 'Sembunyikan password' : 'Tampilkan password'}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {error && (
              <div
                role="alert"
                className="flex items-start gap-2 rounded-lg border border-danger/25 bg-danger-soft px-3 py-2.5 text-sm text-danger-strong"
              >
                <AlertCircle size={16} className="mt-0.5 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <button type="submit" className="btn-primary btn-lg w-full" disabled={submitting}>
              {submitting ? <Spinner /> : <ShieldCheck size={18} />}
              {submitting ? 'Memverifikasi…' : 'Masuk'}
            </button>
          </form>

          {/*
            Credentials are only ever printed in a development build. Shipping a
            username/password list on a production login screen hands an attacker
            a starting point, and the demo accounts do not exist in a deployment
            seeded with `npm run db:seed`.
          */}
          {import.meta.env.DEV && (
            <div className="mt-8 rounded-xl border border-line bg-canvas-raised p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
                Akun demo · hanya build pengembangan
              </p>
              <ul className="mt-2 space-y-1 text-xs text-ink-soft">
                <li>
                  <span className="font-mono font-medium text-ink">admin</span> · Super User
                </li>
                <li>
                  <span className="font-mono font-medium text-ink">p001</span> … p100 · Personel
                </li>
                <li className="pt-1 text-ink-muted">
                  Password: <span className="font-mono text-ink">123456</span> — tersedia setelah{' '}
                  <span className="font-mono">npm run db:seed:demo</span>
                </li>
              </ul>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
