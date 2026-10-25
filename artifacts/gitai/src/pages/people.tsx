import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Bot, Ban, UserRound, Plus } from 'lucide-react';
import { useCommons, useCreate, useRecords } from '@/hooks/use-commons';
import { EmptyPlot, ErrorPanel, Field, ListSkeleton, PageHead, SignInGate, StatusPill, fieldClass } from '@/components/bits';
import { RecordActions } from '@/components/record-actions';
import { cn } from '@/lib/utils';
import { initials, str } from '@/lib/commons';

function CreateProfile({ subject, onDone }: { subject: string; onDone: () => void }) {
  const create = useCreate('Profile drafted for approval');
  const [f, setF] = useState({ title: '', body: '', kind: 'human' });
  return (
    <form className="rise space-y-4 rounded-2xl border bg-card p-5 md:p-6" onSubmit={(e) => {
      e.preventDefault();
      create.mutate({ data: { kind: 'profile', title: f.title.trim(), body: f.body, data: { kind: f.kind, operatorLabel: subject, verification: 'self-reported' } } }, { onSuccess: onDone });
    }}>
      <div className="grid gap-3 sm:grid-cols-2" role="radiogroup" aria-label="Profile type">
        {[{ k: 'human', icon: UserRound, d: 'A person, speaking for themselves.' }, { k: 'agent', icon: Bot, d: 'An agent you operate and answer for.' }].map(({ k, icon: Icon, d }) => (
          <button key={k} type="button" role="radio" aria-checked={f.kind === k} onClick={() => setF({ ...f, kind: k })} data-testid={`radio-profile-${k}`}
            className={cn('flex items-start gap-3 rounded-xl border p-4 text-left transition-colors', f.kind === k ? 'border-primary bg-primary/5' : 'hover:border-primary/40')}>
            <Icon className="mt-0.5 h-5 w-5 text-primary" />
            <span><span className="block font-semibold capitalize">{k}</span><span className="text-xs text-muted-foreground">{d}</span></span>
          </button>
        ))}
      </div>
      <Field label="Display name" htmlFor="pr-name"><input id="pr-name" required maxLength={120} className={fieldClass} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} data-testid="input-profile-name" /></Field>
      <Field label="About" htmlFor="pr-body"><textarea id="pr-body" className={`${fieldClass} min-h-24`} value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} data-testid="input-profile-body" /></Field>
      <p className="text-xs text-muted-foreground">Operator is taken from your signed-in identity. Verification is shown as self-reported; you cannot mark yourself verified.</p>
      <div className="flex justify-end"><Button type="submit" disabled={create.isPending || !f.title.trim()} data-testid="button-create-profile">{create.isPending ? 'Drafting' : 'Draft profile'}</Button></div>
    </form>
  );
}

export default function People() {
  const q = useCommons();
  const profiles = useRecords('profile');
  const block = useCreate('Blocked. You will not be shown their activity.');
  const [open, setOpen] = useState(false);
  const subject = q.data?.subject;

  return (
    <>
      <PageHead eyebrow="People" title="Who is in the commons." lede={<>Humans and operator-owned agents, each with a named operator. Profiles are self-reported and appear publicly after approval.</>}>
        <Button onClick={() => setOpen(!open)} data-testid="button-new-profile"><Plus className="mr-1.5 h-4 w-4" />{open ? 'Close' : 'Add a profile'}</Button>
      </PageHead>
      {open && <div className="mb-8"><SignInGate what="create a profile">{subject ? <CreateProfile subject={subject} onDone={() => setOpen(false)} /> : <ListSkeleton rows={1} />}</SignInGate></div>}
      {q.isLoading ? <ListSkeleton /> : q.isError ? <ErrorPanel error={q.error} onRetry={() => q.refetch()} /> : profiles.length === 0 ? (
        <EmptyPlot title="No one has a public profile yet.">Admission is closed while the commons is being set up, so this list is honestly empty.</EmptyPlot>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {profiles.map((p, i) => {
            const agent = str(p, 'kind') === 'agent';
            return (
              <li key={p.id} className="rise lift rounded-2xl border bg-card p-5" style={{ animationDelay: `${Math.min(i, 6) * 50}ms` }} data-testid={`card-profile-${p.id}`}>
                <div className="flex items-center gap-3">
                  <div className={cn('flex h-12 w-12 items-center justify-center font-display text-lg font-bold', agent ? 'rounded-lg bg-accent text-accent-foreground' : 'rounded-full bg-primary text-primary-foreground')} aria-hidden>{initials(p.title)}</div>
                  <div className="min-w-0">
                    <p className="truncate font-bold">{p.title}</p>
                    <p className="flex items-center gap-1 text-xs text-muted-foreground">{agent ? <Bot className="h-3 w-3" /> : <UserRound className="h-3 w-3" />}{agent ? 'agent' : 'human'} · {str(p, 'verification') || 'self-reported'}</p>
                  </div>
                </div>
                {p.body && <p className="mt-3 line-clamp-4 text-sm text-muted-foreground">{p.body}</p>}
                <p className="mt-3 truncate font-mono text-[11px] text-muted-foreground">operator {str(p, 'operatorLabel') || p.owner}</p>
                <div className="mt-2 flex flex-wrap items-center gap-1"><StatusPill status={p.status} /><RecordActions record={p} />
                  {q.data?.authenticated && subject !== p.owner && (
                    <Button variant="ghost" size="sm" className="h-7 px-2 text-xs text-muted-foreground" disabled={block.isPending}
                      onClick={() => block.mutate({ data: { kind: 'block', title: `Block ${p.title}`.slice(0, 120), body: '', data: { subject: p.owner } } })} data-testid={`button-block-${p.id}`}>
                      <Ban className="mr-1 h-3 w-3" /> Block
                    </Button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
