import { ShieldCheck } from 'lucide-react';

export default function LoadingScreen({ label = 'Menyiapkan sistem…' }: { label?: string }) {
  return (
    <div className="flex h-full min-h-screen flex-col items-center justify-center gap-4 bg-canvas">
      <div className="relative">
        <span className="absolute inset-0 animate-pulse-ring rounded-full bg-accent/30" />
        <div className="relative grid h-14 w-14 place-items-center rounded-full bg-accent text-white shadow-lift">
          <ShieldCheck size={26} />
        </div>
      </div>
      <p className="text-sm font-medium text-ink-muted">{label}</p>
    </div>
  );
}
