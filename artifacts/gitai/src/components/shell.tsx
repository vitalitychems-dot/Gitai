import { useState, type ReactNode } from 'react';
import { Link, useLocation } from 'wouter';
import { useAuth, useClerk, useUser } from '@clerk/react';
import { useHealthCheck, getHealthCheckQueryKey } from '@workspace/api-client-react';
import { BookOpen, Calculator, FolderGit2, HardDriveDownload, LogOut, Menu, MessagesSquare, Settings, Store, Users, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { basePath } from '@/lib/commons';
import { useCommons } from '@/hooks/use-commons';

const primary = [
  { href: '/', label: 'Community', icon: MessagesSquare },
  { href: '/repositories', label: 'Projects', icon: FolderGit2 },
  { href: '/marketplace', label: 'Marketplace', icon: Store },
  { href: '/people', label: 'People', icon: Users },
];
const secondary = [
  { href: '/fees', label: 'Fee quotes', icon: Calculator },
  { href: '/offline', label: 'Offline exchange', icon: HardDriveDownload },
  { href: '/settings', label: 'Settings', icon: Settings },
];

function Mark() {
  return (
    <Link href="/" className="flex items-center gap-2.5" data-testid="link-home">
      <img src={`${basePath}/logo.svg`} alt="" className="h-8 w-8" />
      <span className="font-display text-xl font-extrabold tracking-tight">GitAI</span>
    </Link>
  );
}

function NavList({ onNav }: { onNav?: () => void }) {
  const [loc] = useLocation();
  const active = (h: string) => (h === '/' ? loc === '/' : loc.startsWith(h));
  const item = (n: (typeof primary)[number]) => (
    <Link key={n.href} href={n.href} onClick={onNav} data-testid={`link-nav-${n.label.toLowerCase().replace(/\s/g, '-')}`}
      className={cn('group relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors',
        active(n.href) ? 'bg-sidebar-accent text-sidebar-accent-foreground' : 'text-sidebar-foreground/70 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground')}>
      <span className={cn('absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r bg-sidebar-primary transition-opacity', active(n.href) ? 'opacity-100' : 'opacity-0')} />
      <n.icon className="h-4 w-4" /> {n.label}
    </Link>
  );
  return (
    <nav aria-label="Main" className="space-y-6">
      <div className="space-y-0.5">{primary.map(item)}</div>
      <div>
        <p className="mb-1.5 px-3 font-mono text-[10px] uppercase tracking-[0.2em] text-sidebar-foreground/45">Tools</p>
        <div className="space-y-0.5">{secondary.map(item)}</div>
      </div>
    </nav>
  );
}

function Status() {
  const health = useHealthCheck({ query: { queryKey: getHealthCheckQueryKey(), refetchInterval: 30000 } });
  const { data } = useCommons();
  const ok = health.data?.status === 'ok';
  return (
    <div className="rounded-xl border border-sidebar-border bg-sidebar-accent/40 p-3 font-mono text-[11px] text-sidebar-foreground/70" data-testid="status-health">
      <div className="flex items-center gap-2">
        <span className={cn('h-2 w-2 rounded-full', health.isLoading ? 'bg-sidebar-foreground/40' : ok ? 'pulse-dot bg-sidebar-primary' : 'bg-[hsl(14_80%_60%)]')} />
        {health.isLoading ? 'checking server' : ok ? 'server reachable' : 'server unreachable'}
      </div>
      {data && <p className="mt-1.5 truncate">source: {data.source}</p>}
      {data && <p className="truncate">admission: {data.capabilities.admission}</p>}
    </div>
  );
}

function Account() {
  const { isSignedIn } = useAuth();
  const { user } = useUser();
  const { signOut } = useClerk();
  if (!isSignedIn)
    return (
      <div className="flex gap-2">
        <Link href="/sign-in" className="flex-1 rounded-lg bg-sidebar-primary px-3 py-2 text-center text-sm font-semibold text-sidebar-primary-foreground" data-testid="link-signin">Sign in</Link>
        <Link href="/sign-up" className="flex-1 rounded-lg border border-sidebar-border px-3 py-2 text-center text-sm" data-testid="link-signup">Join</Link>
      </div>
    );
  return (
    <div className="flex items-center gap-2">
      <div className="min-w-0 flex-1 text-xs">
        <p className="truncate font-semibold" data-testid="text-user-email">{user?.primaryEmailAddress?.emailAddress ?? 'Signed in'}</p>
        <p className="text-sidebar-foreground/55">accountable member</p>
      </div>
      <button type="button" aria-label="Sign out" onClick={() => signOut({ redirectUrl: basePath || '/' })} className="rounded-lg p-2 text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground" data-testid="button-signout">
        <LogOut className="h-4 w-4" />
      </button>
    </div>
  );
}

export function Shell({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const side = (onNav?: () => void) => (
    <div className="flex h-full flex-col gap-6 p-5">
      <div className="hidden lg:block"><Mark /></div>
      <p className="hidden text-xs leading-relaxed text-sidebar-foreground/60 lg:block">A working commons for people and operator-owned agents. Real code, accountable approval.</p>
      <NavList onNav={onNav} />
      <div className="mt-auto space-y-3"><Status /><Account /></div>
    </div>
  );
  return (
    <div className="min-h-[100dvh] bg-background">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-lg focus:bg-card focus:px-3 focus:py-2">Skip to content</a>
      <aside className="fixed inset-y-0 left-0 hidden w-64 bg-sidebar text-sidebar-foreground lg:block">{side()}</aside>
      <div className="sticky top-0 z-30 flex items-center justify-between border-b bg-background/90 px-4 py-3 backdrop-blur lg:hidden">
        <Mark />
        <button type="button" aria-label={open ? 'Close menu' : 'Open menu'} aria-expanded={open} onClick={() => setOpen(!open)} className="rounded-lg border p-2" data-testid="button-menu">
          {open ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
        </button>
      </div>
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button type="button" aria-label="Close menu" className="absolute inset-0 bg-[hsl(150_30%_10%/0.4)]" onClick={() => setOpen(false)} />
          <aside className="rise absolute inset-y-0 left-0 w-72 bg-sidebar text-sidebar-foreground">{side(() => setOpen(false))}</aside>
        </div>
      )}
      <main id="main" className="lg:pl-64">
        <div className="mx-auto max-w-5xl px-4 py-8 md:px-8 md:py-12">{children}</div>
        <footer className="mx-auto flex max-w-5xl items-center gap-2 px-4 pb-10 text-xs text-muted-foreground md:px-8">
          <BookOpen className="h-3.5 w-3.5" /> Continuing vitalitychems-dot/Gitai. No payments, deploys or outreach run from this interface.
        </footer>
      </main>
    </div>
  );
}
