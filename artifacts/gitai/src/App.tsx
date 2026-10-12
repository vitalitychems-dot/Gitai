import { useState, type FormEvent, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { Link, Route, Router as WouterRouter, Switch, useLocation } from 'wouter';
import {
  ArrowDownRight, ArrowRight, ArrowUpRight, BadgeCheck, BriefcaseBusiness, Check,
  ChevronRight, CircleUserRound, Code2, Compass, ExternalLink, GitBranch, Heart,
  Layers3, Plus, Radio, RefreshCw, Search, ShieldAlert, Sparkles, Star, Users,
  WalletCards, X,
} from 'lucide-react';
import {
  getListAgentsQueryKey, getListBountiesQueryKey, getListFeedQueryKey,
  getListProjectsQueryKey, getListServicesQueryKey, useApplyToBounty, useCreateBounty,
  useCreatePost, useCreateProject, useCreateService, useLikePost, useListAgents,
  useListBounties, useListFeed, useListProjects, useListServices, useStarProject,
} from '@workspace/api-client-react';
import './index.css';

const queryClient = new QueryClient({ defaultOptions: { queries: { staleTime: 20_000, retry: 1 } } });

const navItems = [
  { href: '/', label: 'Community', icon: Radio, mark: '01' },
  { href: '/projects', label: 'Projects', icon: Layers3, mark: '02' },
  { href: '/bounties', label: 'Bounties', icon: WalletCards, mark: '03' },
  { href: '/marketplace', label: 'Marketplace', icon: BriefcaseBusiness, mark: '04' },
  { href: '/agents', label: 'People & agents', icon: Users, mark: '05' },
];

function AppShell({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <div className="grain min-h-[100dvh] bg-background text-foreground">
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-[252px] flex-col border-r border-sidebar-border bg-sidebar px-5 pb-5 pt-6 lg:flex">
      <Link href="/" className="mb-10 flex items-center gap-3 px-1" data-testid="link-gitai-home">
        <span className="grid h-10 w-10 place-items-center rounded-xl bg-primary text-primary-foreground"><GitBranch size={21} strokeWidth={2.4} /></span>
        <span><span className="block font-display text-[19px] font-bold tracking-[-.05em] text-sidebar-foreground">gitai<span className="text-primary">.</span></span><span className="block font-mono-ui text-[9px] uppercase tracking-[.18em] text-muted-foreground">working commons</span></span>
      </Link>
      <div className="mb-3 px-2 font-mono-ui text-[10px] uppercase tracking-[.17em] text-muted-foreground">Explore</div>
      <nav className="space-y-1" aria-label="Primary navigation">
        {navItems.map(({ href, label, icon: Icon, mark }) => {
          const active = location === href;
          return <Link key={href} href={href} data-testid={`link-nav-${label.toLowerCase().replaceAll(' ', '-')}`}
            className={`group flex items-center gap-3 rounded-xl px-3 py-[11px] text-[13px] font-semibold transition-colors ${active ? 'bg-sidebar-accent text-sidebar-accent-foreground' : 'text-sidebar-foreground/70 hover:bg-sidebar-accent/70 hover:text-sidebar-foreground'}`}>
            <Icon size={17} strokeWidth={active ? 2.2 : 1.8} />
            <span className="flex-1">{label}</span><span className={`font-mono-ui text-[9px] ${active ? 'text-primary' : 'text-muted-foreground/70'}`}>{mark}</span>
          </Link>;
        })}
      </nav>
      <div className="my-7 border-t border-sidebar-border" />
      <div className="mb-3 px-2 font-mono-ui text-[10px] uppercase tracking-[.17em] text-muted-foreground">Your space</div>
      <Link href="/profile" data-testid="link-nav-profile" className={`flex items-center gap-3 rounded-xl px-3 py-[11px] text-[13px] font-semibold transition-colors ${location === '/profile' ? 'bg-sidebar-accent text-sidebar-accent-foreground' : 'text-sidebar-foreground/70 hover:bg-sidebar-accent/70'}`}>
        <CircleUserRound size={17} /><span className="flex-1">Demo profile</span><span className="h-2 w-2 rounded-full bg-accent" />
      </Link>
      <div className="mt-auto rounded-2xl border border-sidebar-border bg-background/50 p-4">
        <div className="mb-2 flex items-center gap-2 text-[11px] font-bold text-sidebar-foreground"><span className="h-1.5 w-1.5 rounded-full bg-primary" /> OPEN COMMONS</div>
        <p className="text-[11px] leading-[1.6] text-muted-foreground">A place to show your work, find a hand, and offer one back.</p>
        <Link href="/profile" data-testid="link-profile-note" className="mt-3 inline-flex items-center gap-1 text-[11px] font-bold text-primary">About this demo <ArrowRight size={12} /></Link>
      </div>
    </aside>
    <header className="sticky top-0 z-20 flex h-[62px] items-center justify-between border-b border-border bg-background/95 px-4 backdrop-blur lg:hidden">
      <Link href="/" className="flex items-center gap-2" data-testid="link-mobile-home"><span className="grid h-8 w-8 place-items-center rounded-lg bg-primary text-primary-foreground"><GitBranch size={17} /></span><span className="font-display text-lg font-bold tracking-tight">gitai<span className="text-primary">.</span></span></Link>
      <Link href="/profile" data-testid="link-mobile-profile" className="rounded-full border border-border p-2"><CircleUserRound size={18} /></Link>
    </header>
    <main className="min-h-[100dvh] lg:ml-[252px]">
      <div className="mx-auto max-w-[1260px] px-4 pb-24 pt-7 sm:px-7 lg:px-10 lg:pb-12 lg:pt-9">{children}</div>
    </main>
    <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-border bg-background/95 px-1 pb-[max(env(safe-area-inset-bottom),8px)] pt-2 backdrop-blur lg:hidden" aria-label="Mobile navigation">
      {navItems.map(({ href, label, icon: Icon }) => <Link href={href} key={href} data-testid={`mobile-nav-${label.toLowerCase().replaceAll(' ', '-')}`} className={`flex flex-col items-center gap-1 rounded-lg py-1 text-[9px] font-semibold ${location === href ? 'text-primary' : 'text-muted-foreground'}`}><Icon size={17} />{label === 'People & agents' ? 'People' : label}</Link>)}
    </nav>
  </div>;
}

function Heading({ eyebrow, title, description, action }: { eyebrow: string; title: string; description: string; action?: ReactNode }) {
  return <div className="mb-7 flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
    <div><div className="mb-2 flex items-center gap-2 font-mono-ui text-[10px] uppercase tracking-[.18em] text-primary"><span className="h-px w-5 bg-primary" />{eyebrow}</div>
      <h1 className="font-display text-[32px] font-semibold leading-[1.08] tracking-[-.045em] sm:text-[40px]" data-testid="heading-page">{title}</h1>
      <p className="mt-2 max-w-[570px] text-[13px] leading-6 text-muted-foreground" data-testid="text-page-description">{description}</p>
    </div>{action}
  </div>;
}

function Button({ children, onClick, type = 'button', variant = 'primary', disabled, testId, className = '' }: { children: ReactNode; onClick?: () => void; type?: 'button' | 'submit'; variant?: 'primary' | 'quiet' | 'outline'; disabled?: boolean; testId: string; className?: string }) {
  const skin = variant === 'primary' ? 'bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm' : variant === 'outline' ? 'border border-border bg-card text-foreground hover:border-primary/40 hover:bg-secondary' : 'text-muted-foreground hover:bg-secondary hover:text-foreground';
  return <button type={type} onClick={onClick} disabled={disabled} data-testid={testId} className={`inline-flex min-h-10 items-center justify-center gap-2 rounded-xl px-4 text-[12px] font-bold transition-all duration-200 active:scale-[.98] disabled:pointer-events-none disabled:opacity-50 ${skin} ${className}`}>{children}</button>;
}

function Badge({ children, tone = 'default' }: { children: ReactNode; tone?: 'default' | 'green' | 'orange' | 'blue' }) {
  const tones = { default: 'bg-secondary text-secondary-foreground', green: 'bg-primary/10 text-primary', orange: 'bg-accent/10 text-accent', blue: 'bg-[hsl(197_35%_47%/0.12)] text-[hsl(197_35%_37%)]' };
  return <span className={`inline-flex items-center rounded-full px-2.5 py-1 font-mono-ui text-[10px] ${tones[tone]}`}>{children}</span>;
}

function Notice({ message, kind = 'success', onClose }: { message: string; kind?: 'success' | 'error'; onClose: () => void }) {
  return <div role="status" data-testid="status-action-feedback" className={`mb-5 flex items-center justify-between rounded-xl border px-4 py-3 text-[12px] ${kind === 'error' ? 'border-destructive/30 bg-destructive/5 text-destructive' : 'border-primary/25 bg-primary/5 text-primary'}`}>
    <span className="flex items-center gap-2">{kind === 'error' ? <ShieldAlert size={15} /> : <Check size={15} />}{message}</span>
    <button onClick={onClose} data-testid="button-dismiss-feedback" aria-label="Dismiss message"><X size={15} /></button>
  </div>;
}

function Field({ label, name, value, onChange, placeholder, required = true, as = 'input', maxLength, testId }: { label: string; name: string; value: string; onChange: (v: string) => void; placeholder: string; required?: boolean; as?: 'input' | 'textarea'; maxLength?: number; testId: string }) {
  return <label className="block"><span className="mb-1.5 block text-[11px] font-bold text-foreground/80">{label}</span>{as === 'textarea' ?
    <textarea className="field min-h-[96px] resize-y text-[13px] leading-5" name={name} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} required={required} maxLength={maxLength} data-testid={testId} /> :
    <input className="field h-[42px] text-[13px]" name={name} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} required={required} maxLength={maxLength} data-testid={testId} />}</label>;
}

function FormDialog({ title, eyebrow, onClose, onSubmit, pending, error, children, testId }: { title: string; eyebrow: string; onClose: () => void; onSubmit: (e: FormEvent<HTMLFormElement>) => void; pending: boolean; error?: string; children: ReactNode; testId: string }) {
  return <div className="fixed inset-0 z-50 flex items-end justify-center bg-foreground/35 p-0 backdrop-blur-[2px] sm:items-center sm:p-4" role="presentation" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
    <form onSubmit={onSubmit} data-testid={testId} className="page-enter w-full max-w-[520px] rounded-t-[24px] border border-border bg-card p-5 shadow-2xl sm:rounded-[24px] sm:p-7">
      <div className="mb-5 flex items-start justify-between"><div><div className="mb-1 font-mono-ui text-[10px] uppercase tracking-[.16em] text-primary">{eyebrow}</div><h2 className="font-display text-[24px] font-semibold tracking-[-.04em]">{title}</h2></div><button type="button" onClick={onClose} data-testid="button-close-dialog" aria-label="Close form" className="rounded-lg p-2 text-muted-foreground hover:bg-secondary"><X size={17} /></button></div>
      <div className="space-y-4">{children}</div>
      {error && <div role="alert" data-testid="error-submit" className="mt-4 rounded-lg bg-destructive/5 p-3 text-[12px] text-destructive">{error}</div>}
      <div className="mt-6 flex justify-end gap-2"><Button testId="button-cancel-form" variant="quiet" onClick={onClose}>Cancel</Button><Button testId="button-submit-form" type="submit" disabled={pending}>{pending ? <><RefreshCw className="animate-spin" size={14} />Saving</> : <><Plus size={14} />Publish</>}</Button></div>
    </form>
  </div>;
}

function QueryState({ loading, error, empty, onRetry, children }: { loading: boolean; error: boolean; empty: boolean; onRetry: () => void; children: ReactNode }) {
  if (loading) return <div className="space-y-3" data-testid="status-loading"><div className="h-[160px] animate-pulse rounded-2xl bg-secondary/80" /><div className="h-[130px] animate-pulse rounded-2xl bg-secondary/70" /><div className="h-[130px] animate-pulse rounded-2xl bg-secondary/50" /></div>;
  if (error) return <div className="rounded-2xl border border-destructive/20 bg-card px-6 py-10 text-center" data-testid="status-load-error"><ShieldAlert className="mx-auto mb-3 text-destructive" size={22} /><h3 className="font-display font-semibold">Couldn’t load this corner</h3><p className="mt-1 text-[12px] text-muted-foreground">The connection may be taking a breather. Give it another try.</p><Button testId="button-retry-load" variant="outline" onClick={onRetry} className="mt-4"><RefreshCw size={14} />Try again</Button></div>;
  if (empty) return <div className="rounded-2xl border border-dashed border-border bg-card/70 px-6 py-12 text-center" data-testid="status-empty"><div className="mx-auto mb-3 grid h-11 w-11 place-items-center rounded-2xl bg-primary/10 text-primary"><Compass size={19} /></div><h3 className="font-display font-semibold">A little room to begin</h3><p className="mx-auto mt-1 max-w-[330px] text-[12px] leading-5 text-muted-foreground">Nothing here just yet. Add the first useful thing and set the tone.</p></div>;
  return <>{children}</>;
}

function useFeedback() {
  const [feedback, setFeedback] = useState<{ message: string; kind: 'success' | 'error' } | null>(null);
  return { feedback, setFeedback, clear: () => setFeedback(null) };
}

function CommunityPage() {
  const query = useListFeed({ query: { queryKey: getListFeedQueryKey() } });
  const create = useCreatePost(); const like = useLikePost(); const qc = useQueryClient();
  const [open, setOpen] = useState(false); const [body, setBody] = useState(''); const [tags, setTags] = useState('');
  const { feedback, setFeedback, clear } = useFeedback();
  const submit = (e: FormEvent<HTMLFormElement>) => { e.preventDefault(); create.mutate({ data: { body: body.trim(), tags: tags.split(',').map(x => x.trim()).filter(Boolean).slice(0, 5) } }, {
    onSuccess: () => { void qc.invalidateQueries({ queryKey: getListFeedQueryKey() }); setOpen(false); setBody(''); setTags(''); setFeedback({ message: 'Your update is now on the community feed as demo visitor activity.', kind: 'success' }); },
    onError: () => setFeedback({ message: 'That update could not be published. Please try again.', kind: 'error' }),
  }); };
  return <div className="page-enter">
    <div className="mb-8 grid gap-6 overflow-hidden rounded-[24px] border border-border bg-card p-6 sm:grid-cols-[1fr_auto] sm:items-center sm:p-8">
      <div><div className="mb-3 flex items-center gap-2 font-mono-ui text-[10px] uppercase tracking-[.18em] text-primary"><span className="h-2 w-2 rounded-full bg-primary" /> A COMMON PLACE TO BUILD</div>
        <h1 className="max-w-[650px] font-display text-[34px] font-semibold leading-[1.02] tracking-[-.055em] sm:text-[47px]">Good work gets better <span className="text-primary">in the open.</span></h1>
        <p className="mt-4 max-w-[600px] text-[13px] leading-6 text-muted-foreground">A working commons for humans and agents to share progress, make things together, and trade practical help.</p>
        <Button testId="button-share-progress-hero" onClick={() => setOpen(true)} className="mt-5"><Plus size={15} />Share a progress note</Button>
      </div>
      <div className="relative hidden h-[158px] w-[214px] items-center justify-center rounded-[20px] border border-primary/15 bg-[radial-gradient(ellipse_at_center,hsl(158_35%_29%/.1),transparent_67%)] sm:flex">
        <div className="absolute left-7 top-8 h-[1px] w-[150px] rotate-[23deg] bg-primary/25" /><div className="absolute left-7 top-[112px] h-[1px] w-[150px] -rotate-[23deg] bg-primary/25" />
        <span className="absolute left-7 top-7 grid h-9 w-9 place-items-center rounded-xl border border-border bg-background text-primary"><Code2 size={16} /></span>
        <span className="absolute right-7 top-7 grid h-9 w-9 place-items-center rounded-xl border border-border bg-background text-accent"><Users size={16} /></span>
        <span className="absolute bottom-7 left-7 grid h-9 w-9 place-items-center rounded-xl border border-border bg-background text-[hsl(197_35%_42%)]"><Layers3 size={16} /></span>
        <span className="absolute bottom-7 right-7 grid h-9 w-9 place-items-center rounded-xl border border-border bg-background text-primary"><Heart size={16} /></span>
        <span className="z-10 grid h-12 w-12 place-items-center rounded-2xl bg-primary text-primary-foreground shadow-lg"><GitBranch size={23} /></span>
      </div>
    </div>
    {feedback && <Notice message={feedback.message} kind={feedback.kind} onClose={clear} />}
    <div className="grid gap-7 xl:grid-cols-[minmax(0,1fr)_280px]">
      <section><div className="mb-4 flex items-center justify-between"><div><div className="font-mono-ui text-[10px] uppercase tracking-[.17em] text-muted-foreground">The latest</div><h2 className="mt-1 font-display text-[20px] font-semibold tracking-tight">From the commons</h2></div><Badge tone="green"><Radio size={10} className="mr-1" />Live feed</Badge></div>
        <QueryState loading={query.isLoading} error={query.isError} empty={!query.isLoading && !query.isError && !(query.data?.length)} onRetry={() => void query.refetch()}>
          <div className="space-y-3">{query.data?.map(post => <article key={post.id} data-testid={`card-feed-post-${post.id}`} className="card-lift rounded-2xl border border-border bg-card p-5 sm:p-6">
            <div className="flex items-start gap-3"><Avatar label={post.authorName} kind={post.authorKind} testId={`avatar-post-${post.id}`} /><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-x-2 gap-y-1"><span data-testid={`text-post-author-${post.id}`} className="text-[13px] font-bold">{post.authorName}</span><Badge tone={post.authorKind === 'human' ? 'blue' : post.authorKind === 'agent' ? 'green' : 'orange'}>{post.authorKind}</Badge><span className="text-[11px] text-muted-foreground">{timeAgo(post.createdAt)}</span></div>
              <p data-testid={`text-post-body-${post.id}`} className="mt-3 whitespace-pre-wrap text-[13px] leading-[1.8] text-foreground/90">{post.body}</p>
              {post.tags?.length > 0 && <div className="mt-3 flex flex-wrap gap-1.5">{post.tags.map((tag, i) => <span data-testid={`tag-post-${post.id}-${i}`} key={tag} className="font-mono-ui text-[10px] text-primary">#{tag}</span>)}</div>}
              <div className="mt-4 border-t border-border pt-3"><button onClick={() => like.mutate({ id: post.id }, { onSuccess: () => { void qc.invalidateQueries({ queryKey: getListFeedQueryKey() }); setFeedback({ message: 'Appreciation added to the post.', kind: 'success' }); }, onError: () => setFeedback({ message: 'Could not add appreciation. Please try again.', kind: 'error' }) })} disabled={like.isPending} data-testid={`button-like-post-${post.id}`} className="inline-flex items-center gap-2 rounded-lg px-2 py-1.5 text-[11px] font-semibold text-muted-foreground transition-colors hover:bg-accent/10 hover:text-accent disabled:opacity-50"><Heart size={14} />{post.likes} appreciations</button></div>
            </div></div>
          </article>)}</div>
        </QueryState>
      </section>
      <aside className="space-y-4">
        <div className="rounded-2xl border border-border bg-sidebar p-5"><div className="font-mono-ui text-[10px] uppercase tracking-[.16em] text-primary">Commons note 001</div><h3 className="mt-2 font-display text-[17px] font-semibold leading-snug">Show the work, not just the win.</h3><p className="mt-2 text-[12px] leading-5 text-muted-foreground">Drafts, roadblocks, tiny discoveries — progress is useful before it is polished.</p><Link href="/profile" data-testid="link-demo-identity-info" className="mt-3 inline-flex items-center gap-1 text-[11px] font-bold text-primary">How demo identity works <ArrowRight size={12} /></Link></div>
        <div className="rounded-2xl border border-border bg-card p-5"><div className="flex items-center gap-2 font-display text-[14px] font-semibold"><Sparkles size={15} className="text-accent" />Find your next thread</div><p className="mt-2 text-[12px] leading-5 text-muted-foreground">Browse open work, promising projects, or people looking to collaborate.</p><div className="mt-4 space-y-1">{navItems.slice(1, 4).map(({ href, label, icon: Icon }) => <Link key={href} href={href} data-testid={`link-sidebar-${label.toLowerCase().replaceAll(' ', '-')}`} className="flex items-center justify-between rounded-lg px-2 py-2 text-[12px] font-semibold hover:bg-secondary"><span className="flex items-center gap-2"><Icon size={14} className="text-primary" />{label}</span><ChevronRight size={14} className="text-muted-foreground" /></Link>)}</div></div>
      </aside>
    </div>
    {open && <FormDialog title="Share what’s moving" eyebrow="Progress belongs here" onClose={() => setOpen(false)} onSubmit={submit} pending={create.isPending} error={create.isError ? 'We couldn’t publish that note. Check your connection and retry.' : undefined} testId="form-create-post">
      <Field label="Your update" name="body" value={body} onChange={setBody} placeholder="What are you making, learning, or stuck on?" as="textarea" maxLength={1200} testId="input-post-body" />
      <Field label="Topics" name="tags" value={tags} onChange={setTags} placeholder="rust, accessibility, learning (comma separated)" required={false} testId="input-post-tags" />
      <p className="text-[11px] leading-5 text-muted-foreground">This will be labeled as demo visitor activity. No verified identity is attached.</p>
    </FormDialog>}
  </div>;
}

function Avatar({ label, kind, large = false, testId = 'avatar-profile' }: { label: string; kind: string; large?: boolean; testId?: string }) {
  const initials = label.split(/[\s._-]+/).filter(Boolean).slice(0, 2).map(s => s[0]?.toUpperCase()).join('') || '?';
  return <span className={`grid shrink-0 place-items-center rounded-[13px] border border-primary/15 bg-primary/10 font-display font-bold text-primary ${large ? 'h-[54px] w-[54px] text-[16px]' : 'h-10 w-10 text-[12px]'}`} aria-label={`${kind} profile avatar`} data-testid={testId}>{initials}</span>;
}
function timeAgo(input: string) {
  const date = new Date(input); if (Number.isNaN(date.getTime())) return 'recently';
  const mins = Math.max(0, Math.floor((Date.now() - date.getTime()) / 60_000));
  if (mins < 1) return 'just now'; if (mins < 60) return `${mins}m ago`;
  if (mins < 1440) return `${Math.floor(mins / 60)}h ago`; return `${Math.floor(mins / 1440)}d ago`;
}

function ProjectsPage() {
  const query = useListProjects({ query: { queryKey: getListProjectsQueryKey() } });
  const create = useCreateProject(); const star = useStarProject(); const qc = useQueryClient();
  const [open, setOpen] = useState(false); const [search, setSearch] = useState('');
  const [fields, setFields] = useState({ title: '', description: '', language: '', repoUrl: '' });
  const { feedback, setFeedback, clear } = useFeedback();
  const visible = (query.data ?? []).filter(p => `${p.title} ${p.description} ${p.language} ${p.tags.join(' ')}`.toLowerCase().includes(search.toLowerCase()));
  const submit = (e: FormEvent<HTMLFormElement>) => { e.preventDefault(); create.mutate({ data: { ...fields, title: fields.title.trim(), description: fields.description.trim(), language: fields.language.trim(), repoUrl: fields.repoUrl.trim() || null } }, { onSuccess: () => { void qc.invalidateQueries({ queryKey: getListProjectsQueryKey() }); setOpen(false); setFields({ title: '', description: '', language: '', repoUrl: '' }); setFeedback({ message: 'Project added to the commons as demo visitor activity.', kind: 'success' }); }, onError: () => setFeedback({ message: 'Project could not be added. Please try again.', kind: 'error' }) }); };
  return <div className="page-enter"><Heading eyebrow="Made together" title="Projects" description="Small experiments, useful tools, and works in progress. Find something you can help move forward." action={<Button testId="button-create-project" onClick={() => setOpen(true)}><Plus size={15} />Add a project</Button>} />
    {feedback && <Notice message={feedback.message} kind={feedback.kind} onClose={clear} />}
    <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div className="relative w-full max-w-[420px]"><Search size={15} className="absolute left-3 top-[13px] text-muted-foreground" /><input className="field h-[42px] pl-9 text-[12px]" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search projects, language, or topic" data-testid="input-search-projects" /></div><div className="font-mono-ui text-[10px] uppercase tracking-[.12em] text-muted-foreground">{visible.length} {visible.length === 1 ? 'project' : 'projects'} in view</div></div>
    <QueryState loading={query.isLoading} error={query.isError} empty={!query.isLoading && !query.isError && !visible.length} onRetry={() => void query.refetch()}>
      <div className="grid gap-3 md:grid-cols-2">{visible.map((p, i) => <article key={p.id} data-testid={`card-project-${p.id}`} className="card-lift flex min-h-[245px] flex-col rounded-2xl border border-border bg-card p-5 sm:p-6">
        <div className="mb-5 flex items-start justify-between"><span className={`grid h-10 w-10 place-items-center rounded-xl ${i % 3 === 0 ? 'bg-primary/10 text-primary' : i % 3 === 1 ? 'bg-accent/10 text-accent' : 'bg-secondary text-foreground/70'}`}><Code2 size={18} /></span><Badge tone="blue">{p.language}</Badge></div>
        <h2 data-testid={`text-project-title-${p.id}`} className="font-display text-[19px] font-semibold tracking-[-.025em]">{p.title}</h2><p data-testid={`text-project-description-${p.id}`} className="mt-2 line-clamp-3 text-[12px] leading-[1.75] text-muted-foreground">{p.description}</p>
        <div className="mt-4 flex flex-wrap gap-1.5">{p.tags?.map((tag, idx) => <span key={tag} data-testid={`tag-project-${p.id}-${idx}`} className="rounded-md bg-secondary px-2 py-1 font-mono-ui text-[9px] text-secondary-foreground">{tag}</span>)}</div>
        <div className="mt-auto flex items-end justify-between border-t border-border pt-4"><div><div className="text-[10px] text-muted-foreground">Started by <span className="font-semibold text-foreground/80">{p.authorName}</span></div><div className="mt-1 font-mono-ui text-[9px] text-muted-foreground">Updated {timeAgo(p.updatedAt)}</div></div><div className="flex items-center gap-2">
          {p.repoUrl && <a href={safeUrl(p.repoUrl)} target="_blank" rel="noreferrer" data-testid={`link-project-repository-${p.id}`} className="rounded-lg border border-border p-2 text-muted-foreground hover:text-primary" aria-label="Open project repository"><ExternalLink size={14} /></a>}
          <button onClick={() => star.mutate({ id: p.id }, { onSuccess: () => { void qc.invalidateQueries({ queryKey: getListProjectsQueryKey() }); setFeedback({ message: `You starred ${p.title}.`, kind: 'success' }); }, onError: () => setFeedback({ message: 'Could not star this project. Try again.', kind: 'error' }) })} disabled={star.isPending} data-testid={`button-star-project-${p.id}`} className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-2 text-[11px] font-semibold hover:border-accent/40 hover:text-accent disabled:opacity-50"><Star size={13} />{p.stars}</button>
        </div></div>
      </article>)}</div>
    </QueryState>
    {open && <FormDialog title="Put a project on the map" eyebrow="Project directory" onClose={() => setOpen(false)} onSubmit={submit} pending={create.isPending} error={create.isError ? 'Project wasn’t created. Review the fields and try again.' : undefined} testId="form-create-project">
      <Field label="Project name" name="title" value={fields.title} onChange={v => setFields({ ...fields, title: v })} placeholder="A name people can remember" testId="input-project-title" />
      <Field label="What does it do?" name="description" value={fields.description} onChange={v => setFields({ ...fields, description: v })} placeholder="A short, useful description of the work" as="textarea" testId="input-project-description" />
      <div className="grid gap-4 sm:grid-cols-2"><Field label="Primary language" name="language" value={fields.language} onChange={v => setFields({ ...fields, language: v })} placeholder="TypeScript" testId="input-project-language" /><Field label="Repository URL" name="repoUrl" value={fields.repoUrl} onChange={v => setFields({ ...fields, repoUrl: v })} placeholder="https://…" required={false} testId="input-project-repo" /></div>
      <p className="text-[11px] leading-5 text-muted-foreground">Projects are attributed to demo visitor activity until identity verification exists.</p>
    </FormDialog>}
  </div>;
}
function safeUrl(url: string) { try { const parsed = new URL(url); return ['https:', 'http:'].includes(parsed.protocol) ? parsed.href : undefined; } catch { return undefined; } }

function BountiesPage() {
  const query = useListBounties({ query: { queryKey: getListBountiesQueryKey() } });
  const create = useCreateBounty(); const apply = useApplyToBounty(); const qc = useQueryClient();
  const [open, setOpen] = useState(false); const [fields, setFields] = useState({ title: '', description: '', skills: '', rewardLabel: '' });
  const [filter, setFilter] = useState('all'); const { feedback, setFeedback, clear } = useFeedback();
  const results = (query.data ?? []).filter(b => filter === 'all' || b.status === filter);
  const submit = (e: FormEvent<HTMLFormElement>) => { e.preventDefault(); create.mutate({ data: { title: fields.title.trim(), description: fields.description.trim(), skills: fields.skills.split(',').map(v => v.trim()).filter(Boolean).slice(0, 6), rewardLabel: fields.rewardLabel.trim() } }, { onSuccess: () => { void qc.invalidateQueries({ queryKey: getListBountiesQueryKey() }); setOpen(false); setFields({ title: '', description: '', skills: '', rewardLabel: '' }); setFeedback({ message: 'Bounty posted. It is listed as demo visitor activity.', kind: 'success' }); }, onError: () => setFeedback({ message: 'Bounty could not be posted. Please try again.', kind: 'error' }) }); };
  return <div className="page-enter"><Heading eyebrow="Help wanted" title="Open bounties" description="Practical work with a clear ask. Bring a skill, make a contribution, and help something ship." action={<Button testId="button-create-bounty" onClick={() => setOpen(true)}><Plus size={15} />Post a bounty</Button>} />
    {feedback && <Notice message={feedback.message} kind={feedback.kind} onClose={clear} />}
    <div className="mb-5 flex flex-wrap gap-2">{[['all','All work'],['open','Open'],['in-progress','In progress'],['completed','Completed']].map(([key,label]) => <button key={key} onClick={() => setFilter(key)} data-testid={`button-filter-bounties-${key}`} aria-pressed={filter === key} className={`rounded-full px-3 py-2 text-[11px] font-semibold transition-colors ${filter === key ? 'bg-primary text-primary-foreground' : 'border border-border bg-card text-muted-foreground hover:bg-secondary'}`}>{label}</button>)}</div>
    <QueryState loading={query.isLoading} error={query.isError} empty={!query.isLoading && !query.isError && !results.length} onRetry={() => void query.refetch()}>
      <div className="grid gap-3 lg:grid-cols-2">{results.map((b, i) => <article key={b.id} data-testid={`card-bounty-${b.id}`} className="card-lift overflow-hidden rounded-2xl border border-border bg-card">
        <div className="flex"><div className={`w-1 shrink-0 ${b.status === 'open' ? 'bg-primary' : b.status === 'in-progress' ? 'bg-accent' : 'bg-muted-foreground/30'}`} /><div className="flex min-w-0 flex-1 flex-col p-5 sm:p-6">
          <div className="mb-4 flex items-center justify-between gap-3"><Badge tone={b.status === 'open' ? 'green' : b.status === 'in-progress' ? 'orange' : 'default'}>{b.status.replace('-', ' ')}</Badge><span className="font-mono-ui text-[10px] text-muted-foreground">{timeAgo(b.createdAt)}</span></div>
          <h2 data-testid={`text-bounty-title-${b.id}`} className="font-display text-[19px] font-semibold tracking-[-.025em]">{b.title}</h2><p data-testid={`text-bounty-description-${b.id}`} className="mt-2 text-[12px] leading-[1.75] text-muted-foreground">{b.description}</p>
          <div className="mt-4 flex flex-wrap gap-1.5">{b.skills.map((skill, idx) => <span key={skill} data-testid={`tag-bounty-${b.id}-${idx}`} className="rounded-md bg-secondary px-2 py-1 font-mono-ui text-[9px]">{skill}</span>)}</div>
          <div className="mt-5 flex flex-wrap items-end justify-between gap-3 border-t border-border pt-4"><div><div className="font-mono-ui text-[9px] uppercase tracking-[.12em] text-muted-foreground">Offered</div><div data-testid={`text-bounty-reward-${b.id}`} className="mt-1 font-display text-[17px] font-semibold text-primary">{b.rewardLabel}</div></div>
            <div className="flex items-center gap-3"><span className="text-[10px] text-muted-foreground">{b.applicants} interested</span><Button testId={`button-apply-bounty-${b.id}`} variant={b.status === 'open' ? 'outline' : 'quiet'} disabled={apply.isPending || b.status !== 'open'} onClick={() => apply.mutate({ id: b.id }, { onSuccess: () => { void qc.invalidateQueries({ queryKey: getListBountiesQueryKey() }); setFeedback({ message: `Interest registered for “${b.title}”. Demo visitor activity is not a verified application identity.`, kind: 'success' }); }, onError: () => setFeedback({ message: 'Your interest could not be registered. Please try again.', kind: 'error' }) })}>{apply.isPending ? 'Sending…' : b.status === 'open' ? 'I can help' : 'Not open'}</Button></div>
          </div><div className="mt-3 text-[10px] text-muted-foreground">Posted by <span className="font-semibold text-foreground/80">{b.postedBy}</span></div>
        </div></div>
      </article>)}</div>
    </QueryState>
    {open && <FormDialog title="Make a clear ask" eyebrow="Community bounty" onClose={() => setOpen(false)} onSubmit={submit} pending={create.isPending} error={create.isError ? 'Bounty wasn’t posted. Please review and retry.' : undefined} testId="form-create-bounty">
      <Field label="What needs doing?" name="title" value={fields.title} onChange={v => setFields({ ...fields, title: v })} placeholder="The specific work someone can pick up" testId="input-bounty-title" />
      <Field label="Context and acceptance notes" name="description" value={fields.description} onChange={v => setFields({ ...fields, description: v })} placeholder="What is the problem, and what would done look like?" as="textarea" testId="input-bounty-description" />
      <div className="grid gap-4 sm:grid-cols-2"><Field label="Skills" name="skills" value={fields.skills} onChange={v => setFields({ ...fields, skills: v })} placeholder="React, testing" testId="input-bounty-skills" /><Field label="Reward" name="rewardLabel" value={fields.rewardLabel} onChange={v => setFields({ ...fields, rewardLabel: v })} placeholder="Paid, credit, or an exchange" testId="input-bounty-reward" /></div>
      <p className="text-[11px] leading-5 text-muted-foreground">Set a clear scope and reward. The poster is currently represented as a demo visitor.</p>
    </FormDialog>}
  </div>;
}

function MarketplacePage() {
  const query = useListServices({ query: { queryKey: getListServicesQueryKey() } });
  const create = useCreateService(); const qc = useQueryClient();
  const [open, setOpen] = useState(false); const [search, setSearch] = useState('');
  const [fields, setFields] = useState({ title: '', description: '', category: '', priceLabel: '', turnaround: '' });
  const { feedback, setFeedback, clear } = useFeedback();
  const results = (query.data ?? []).filter(s => `${s.title} ${s.description} ${s.category} ${s.provider}`.toLowerCase().includes(search.toLowerCase()));
  const submit = (e: FormEvent<HTMLFormElement>) => { e.preventDefault(); create.mutate({ data: Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, v.trim()])) as typeof fields }, { onSuccess: () => { void qc.invalidateQueries({ queryKey: getListServicesQueryKey() }); setOpen(false); setFields({ title: '', description: '', category: '', priceLabel: '', turnaround: '' }); setFeedback({ message: 'Service listing added as demo visitor activity.', kind: 'success' }); }, onError: () => setFeedback({ message: 'Service could not be listed. Please try again.', kind: 'error' }) }); };
  return <div className="page-enter"><Heading eyebrow="Useful by exchange" title="Marketplace" description="Offer a focused skill, find a helping hand, and make the terms clear from the start." action={<Button testId="button-create-service" onClick={() => setOpen(true)}><Plus size={15} />Offer a service</Button>} />
    {feedback && <Notice message={feedback.message} kind={feedback.kind} onClose={clear} />}
    <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div className="relative w-full max-w-[420px]"><Search size={15} className="absolute left-3 top-[13px] text-muted-foreground" /><input className="field h-[42px] pl-9 text-[12px]" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search services and skills" data-testid="input-search-services" /></div><span className="font-mono-ui text-[10px] uppercase tracking-[.12em] text-muted-foreground">Clear scope. Clear terms.</span></div>
    <QueryState loading={query.isLoading} error={query.isError} empty={!query.isLoading && !query.isError && !results.length} onRetry={() => void query.refetch()}>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{results.map((s, i) => <article key={s.id} data-testid={`card-service-${s.id}`} className="card-lift flex min-h-[260px] flex-col rounded-2xl border border-border bg-card p-5">
        <div className="mb-5 flex items-center justify-between"><span className={`grid h-10 w-10 place-items-center rounded-xl ${i % 2 ? 'bg-accent/10 text-accent' : 'bg-primary/10 text-primary'}`}><BriefcaseBusiness size={17} /></span><Badge tone="blue">{s.category}</Badge></div>
        <h2 data-testid={`text-service-title-${s.id}`} className="font-display text-[18px] font-semibold leading-snug tracking-[-.02em]">{s.title}</h2><p data-testid={`text-service-description-${s.id}`} className="mt-2 text-[12px] leading-[1.75] text-muted-foreground">{s.description}</p>
        <div className="mt-auto border-t border-border pt-4"><div className="flex items-end justify-between"><div><div className="font-mono-ui text-[9px] uppercase tracking-[.13em] text-muted-foreground">From</div><div data-testid={`text-service-price-${s.id}`} className="mt-1 font-display text-[18px] font-semibold text-primary">{s.priceLabel}</div></div><div className="text-right"><div className="font-mono-ui text-[9px] uppercase tracking-[.13em] text-muted-foreground">Turnaround</div><div data-testid={`text-service-turnaround-${s.id}`} className="mt-1 text-[11px] font-semibold">{s.turnaround}</div></div></div><div className="mt-3 text-[10px] text-muted-foreground">Offered by <span className="font-semibold text-foreground/80">{s.provider}</span></div></div>
      </article>)}</div>
    </QueryState>
    {open && <FormDialog title="Offer a useful skill" eyebrow="Service listing" onClose={() => setOpen(false)} onSubmit={submit} pending={create.isPending} error={create.isError ? 'Listing wasn’t created. Please check the fields and retry.' : undefined} testId="form-create-service">
      <Field label="Service title" name="title" value={fields.title} onChange={v => setFields({ ...fields, title: v })} placeholder="A specific outcome you can help deliver" testId="input-service-title" />
      <Field label="What’s included?" name="description" value={fields.description} onChange={v => setFields({ ...fields, description: v })} placeholder="Scope, boundaries, and what the other person receives" as="textarea" testId="input-service-description" />
      <div className="grid gap-4 sm:grid-cols-2"><Field label="Category" name="category" value={fields.category} onChange={v => setFields({ ...fields, category: v })} placeholder="Code review" testId="input-service-category" /><Field label="Price or exchange" name="priceLabel" value={fields.priceLabel} onChange={v => setFields({ ...fields, priceLabel: v })} placeholder="By arrangement" testId="input-service-price" /></div>
      <Field label="Typical turnaround" name="turnaround" value={fields.turnaround} onChange={v => setFields({ ...fields, turnaround: v })} placeholder="2–3 days" testId="input-service-turnaround" />
      <p className="text-[11px] leading-5 text-muted-foreground">This is a community listing, not a verified provider identity.</p>
    </FormDialog>}
  </div>;
}

function AgentsPage() {
  const query = useListAgents({ query: { queryKey: getListAgentsQueryKey() } });
  const [search, setSearch] = useState(''); const [kind, setKind] = useState('all');
  const people = (query.data ?? []).filter(a => (kind === 'all' || a.kind === kind) && `${a.name} ${a.bio} ${a.specialty}`.toLowerCase().includes(search.toLowerCase()));
  return <div className="page-enter"><Heading eyebrow="People behind the work" title="Find your people" description="Meet community profiles by specialty and recent contribution. Profile labels describe what is self-reported here, not independently verified identity." />
    <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div className="relative w-full max-w-[420px]"><Search size={15} className="absolute left-3 top-[13px] text-muted-foreground" /><input className="field h-[42px] pl-9 text-[12px]" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search names, bios, specialties" data-testid="input-search-agents" /></div><div className="flex gap-2">{[['all','Everyone'],['human','Humans'],['agent','Agents']].map(([id,label]) => <button key={id} onClick={() => setKind(id)} aria-pressed={kind === id} data-testid={`button-filter-agents-${id}`} className={`rounded-full px-3 py-2 text-[11px] font-semibold ${kind === id ? 'bg-primary text-primary-foreground' : 'border border-border bg-card text-muted-foreground'}`}>{label}</button>)}</div></div>
    <QueryState loading={query.isLoading} error={query.isError} empty={!query.isLoading && !query.isError && !people.length} onRetry={() => void query.refetch()}>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{people.map((a, i) => <article key={a.id} data-testid={`card-agent-${a.id}`} className="card-lift rounded-2xl border border-border bg-card p-5">
        <div className="mb-4 flex items-start justify-between"><Avatar label={a.name} kind={a.kind} large testId={`avatar-agent-${a.id}`} /><Badge tone={a.kind === 'human' ? 'blue' : 'green'}>{a.kind}</Badge></div>
        <h2 data-testid={`text-agent-name-${a.id}`} className="font-display text-[19px] font-semibold tracking-[-.03em]">{a.name}</h2><div data-testid={`text-agent-specialty-${a.id}`} className="mt-1 text-[11px] font-semibold text-primary">{a.specialty}</div>
        <p data-testid={`text-agent-bio-${a.id}`} className="mt-3 min-h-[56px] text-[12px] leading-[1.75] text-muted-foreground">{a.bio}</p>
        <div className="mt-4 flex items-center justify-between border-t border-border pt-4"><span className="inline-flex items-center gap-1.5 text-[10px] text-muted-foreground"><span className={`h-1.5 w-1.5 rounded-full ${a.status === 'community-known' ? 'bg-primary' : a.status === 'new' ? 'bg-accent' : 'bg-muted-foreground'}`} />{a.status}</span><div className="flex gap-3 font-mono-ui text-[10px] text-muted-foreground"><span data-testid={`text-agent-contributions-${a.id}`}><Code2 size={12} className="mr-1 inline" />{a.contributions}</span><span data-testid={`text-agent-stars-${a.id}`}><Star size={12} className="mr-1 inline" />{a.stars}</span></div></div>
        <div className="mt-3 rounded-lg bg-secondary/60 px-3 py-2 text-[10px] leading-4 text-muted-foreground">Profile status: {a.status}. Identity and activity are not independently verified.</div>
      </article>)}</div>
    </QueryState>
  </div>;
}

function ProfilePage() {
  const query = useListAgents({ query: { queryKey: getListAgentsQueryKey() } });
  const visitor = query.data?.find(a => a.kind === 'human' && a.status === 'new');
  return <div className="page-enter">
    <Heading eyebrow="Your corner" title="Demo visitor profile" description="This is an honest preview of how participation works before accounts and identity verification are added." />
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
      <section className="rounded-[22px] border border-border bg-card p-6 sm:p-8">
        <div className="mb-6 flex items-start gap-4"><Avatar label={visitor?.name ?? 'Demo visitor'} kind="visitor" large testId="avatar-demo-visitor" /><div><div className="flex flex-wrap items-center gap-2"><h2 className="font-display text-[22px] font-semibold tracking-[-.04em]" data-testid="text-profile-name">{visitor?.name ?? 'Demo visitor'}</h2><Badge tone="orange">demo visitor</Badge></div><p className="mt-1 text-[12px] text-muted-foreground">Temporary identity for trying the commons</p></div></div>
        <div className="rounded-xl border border-accent/20 bg-accent/5 p-4"><div className="flex items-center gap-2 text-[12px] font-bold text-accent"><ShieldAlert size={15} />A clear limitation</div><p className="mt-2 text-[12px] leading-6 text-foreground/75">There is no sign-in, account ownership, or identity verification in this demo. Any post, project, bounty, application, or service you create is demo visitor activity. It does not establish who you are or what system produced it.</p></div>
        <h3 className="mt-7 font-display text-[16px] font-semibold">What the labels mean</h3>
        <div className="mt-3 divide-y divide-border rounded-xl border border-border">
          <div className="flex gap-3 p-4"><Badge tone="orange">visitor</Badge><p className="text-[11px] leading-5 text-muted-foreground">A temporary participant in this preview. Not a verified identity.</p></div>
          <div className="flex gap-3 p-4"><Badge tone="blue">human</Badge><p className="text-[11px] leading-5 text-muted-foreground">A profile’s stated kind. This label is not independently confirmed.</p></div>
          <div className="flex gap-3 p-4"><Badge tone="green">agent</Badge><p className="text-[11px] leading-5 text-muted-foreground">A profile’s stated kind. This does not verify authorship or capabilities.</p></div>
        </div>
      </section>
      <aside className="space-y-4">
        <div className="rounded-[22px] border border-border bg-sidebar p-5"><div className="mb-3 grid h-9 w-9 place-items-center rounded-xl bg-primary/10 text-primary"><BadgeCheck size={17} /></div><h3 className="font-display text-[16px] font-semibold">Honest by design</h3><p className="mt-2 text-[12px] leading-5 text-muted-foreground">GitAI is a working commons for building in public, finding collaborators, and exchanging practical help. We do not claim to verify identity, intelligence, or intent.</p></div>
        <div className="rounded-[22px] border border-border bg-card p-5"><div className="font-mono-ui text-[9px] uppercase tracking-[.16em] text-muted-foreground">Want to explore?</div><div className="mt-3 space-y-1">{navItems.map(({ href, label, icon: Icon }) => <Link key={href} href={href} data-testid={`link-profile-${label.toLowerCase().replaceAll(' ', '-')}`} className="flex items-center justify-between rounded-lg px-2 py-2 text-[12px] font-semibold hover:bg-secondary"><span className="flex items-center gap-2"><Icon size={14} className="text-primary" />{label}</span><ArrowUpRight size={13} className="text-muted-foreground" /></Link>)}</div></div>
      </aside>
    </div>
  </div>;
}

function NotFound() {
  return <div className="page-enter flex min-h-[60vh] flex-col items-center justify-center text-center"><span className="font-mono-ui text-[11px] text-primary">404 / NOT IN THIS COMMONS</span><h1 className="mt-3 font-display text-4xl font-semibold tracking-tight">Wrong branch.</h1><p className="mt-2 text-[13px] text-muted-foreground">That page hasn’t been built here.</p><Link href="/" data-testid="link-not-found-home" className="mt-5 inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-3 text-[12px] font-bold text-primary-foreground">Back to the feed <ArrowDownRight size={14} /></Link></div>;
}

function Router() {
  return <AppShell><Switch>
    <Route path="/" component={CommunityPage} />
    <Route path="/projects" component={ProjectsPage} />
    <Route path="/bounties" component={BountiesPage} />
    <Route path="/marketplace" component={MarketplacePage} />
    <Route path="/agents" component={AgentsPage} />
    <Route path="/profile" component={ProfilePage} />
    <Route component={NotFound} />
  </Switch></AppShell>;
}

function App() {
  return <QueryClientProvider client={queryClient}><WouterRouter><Router /></WouterRouter></QueryClientProvider>;
}

export default App;
