import type { ReactNode } from 'react';
import { Link } from 'wouter';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { errMsg } from '@/lib/commons';
import { useAuth } from '@clerk/react';
import { LockKeyhole, RotateCcw } from 'lucide-react';

export const fieldClass =
  'w-full rounded-lg border border-input bg-card px-3 py-2 text-sm transition-colors placeholder:text-muted-foreground/70 hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

export function Field({ label, hint, htmlFor, children }: { label: string; hint?: string; htmlFor: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="text-[13px] font-semibold text-foreground/85">{label}</label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

export function PageHead({ eyebrow, title, lede, children }: { eyebrow: string; title: string; lede: ReactNode; children?: ReactNode }) {
  return (
    <header className="rise mb-8 flex flex-col gap-5 border-b border-border/80 pb-7 md:flex-row md:items-end md:justify-between">
      <div className="max-w-2xl">
        <p className="mb-2 font-mono text-[11px] uppercase tracking-[0.22em] text-primary">{eyebrow}</p>
        <h1 className="text-4xl font-extrabold leading-[0.95] md:text-5xl">{title}</h1>
        <div className="mt-3 text-[15px] leading-relaxed text-muted-foreground">{lede}</div>
      </div>
      {children && <div className="flex shrink-0 flex-wrap gap-2">{children}</div>}
    </header>
  );
}

const tone: Record<string, string> = {
  approved: 'bg-primary/12 text-primary border-primary/25',
  merged: 'bg-primary/12 text-primary border-primary/25',
  pending: 'bg-[hsl(40_80%_90%)] text-[hsl(30_70%_28%)] border-[hsl(38_60%_75%)]',
  draft: 'bg-secondary text-secondary-foreground border-border',
  revoked: 'bg-destructive/10 text-destructive border-destructive/25',
  deleted: 'bg-muted text-muted-foreground border-border line-through',
};

export function StatusPill({ status }: { status: string }) {
  return (
    <span data-testid={`status-${status}`} className={cn('inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 font-mono text-[10.5px] uppercase tracking-wider', tone[status] ?? 'bg-muted text-muted-foreground border-border')}>
      <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden />
      {status}
    </span>
  );
}

export function Tag({ children }: { children: ReactNode }) {
  return <span className="rounded-md bg-secondary px-1.5 py-0.5 font-mono text-[11px] text-secondary-foreground">{children}</span>;
}

export function EmptyPlot({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
  return (
    <div className="plot-grid relative overflow-hidden rounded-2xl border border-dashed border-primary/30 bg-card/60 px-6 py-12 text-center">
      <svg aria-hidden viewBox="0 0 120 60" className="mx-auto mb-4 h-14 w-28 text-primary/70">
        <path d="M4 52h112" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        <path d="M60 52V26" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
        <path d="M60 34c-10 0-16-6-16-14 9 0 16 5 16 14Zm0-6c0-9 7-15 17-15 0 9-7 15-17 15Z" fill="hsl(72 58% 62%)" stroke="currentColor" strokeWidth="1.5" />
      </svg>
      <h3 className="text-xl font-bold">{title}</h3>
      <div className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">{children}</div>
      {action && <div className="mt-5 flex justify-center">{action}</div>}
    </div>
  );
}

export function ListSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-3" aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="rounded-2xl border bg-card p-5">
          <Skeleton className="mb-3 h-4 w-1/3" />
          <Skeleton className="mb-2 h-3 w-full" />
          <Skeleton className="h-3 w-2/3" />
        </div>
      ))}
    </div>
  );
}

export function ErrorPanel({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  return (
    <div role="alert" className="rounded-2xl border border-destructive/30 bg-destructive/5 p-6">
      <p className="font-semibold text-destructive">The commons could not be read.</p>
      <p className="mt-1 text-sm text-muted-foreground">{errMsg(error)}</p>
      <Button variant="outline" size="sm" className="mt-4" onClick={onRetry} data-testid="button-retry">
        <RotateCcw className="mr-1.5 h-3.5 w-3.5" /> Try again
      </Button>
    </div>
  );
}

export function SignInGate({ what, children }: { what: string; children: ReactNode }) {
  const { isSignedIn, isLoaded } = useAuth();
  if (!isLoaded) return <Skeleton className="h-28 w-full rounded-2xl" />;
  if (isSignedIn) return <>{children}</>;
  return (
    <div className="flex items-start gap-3 rounded-2xl border bg-secondary/50 p-5">
      <LockKeyhole className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
      <div className="text-sm">
        <p className="font-semibold">Sign in to {what}.</p>
        <p className="mt-0.5 text-muted-foreground">Every write in GitAI is tied to an accountable identity.</p>
        <div className="mt-3 flex gap-2">
          <Link href="/sign-in" className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground" data-testid="link-gate-signin">Sign in</Link>
          <Link href="/sign-up" className="rounded-lg border px-3 py-1.5 text-xs font-semibold" data-testid="link-gate-signup">Create account</Link>
        </div>
      </div>
    </div>
  );
}
