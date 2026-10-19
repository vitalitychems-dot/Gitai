import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'wouter';
import { useQueryClient } from '@tanstack/react-query';
import {
  useGetRepository, getGetRepositoryQueryKey, useProposeChange, useMergeChange, useRequestRun, type CommunityRecord,
} from '@workspace/api-client-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Skeleton } from '@/components/ui/skeleton';
import { ArrowLeft, FileText, GitCommitHorizontal, GitMerge, GitPullRequestArrow, Play, Plus } from 'lucide-react';
import { useCommons, useCreate, useInvalidateCommons, useRecords } from '@/hooks/use-commons';
import { useToast } from '@/hooks/use-toast';
import { EmptyPlot, ErrorPanel, Field, SignInGate, StatusPill, Tag, fieldClass } from '@/components/bits';
import { RecordActions } from '@/components/record-actions';
import { cn } from '@/lib/utils';
import { errMsg, shortId, str, when } from '@/lib/commons';

function ProposalRow({ p, repoId, canMerge, head }: { p: CommunityRecord; repoId: string; canMerge: boolean; head: string }) {
  const qc = useQueryClient();
  const invalidate = useInvalidateCommons();
  const { toast } = useToast();
  const [reviewed, setReviewed] = useState(false);
  const [show, setShow] = useState(false);
  const merge = useMergeChange({ mutation: {
    onSuccess: () => { qc.invalidateQueries({ queryKey: getGetRepositoryQueryKey(repoId) }); invalidate(); toast({ title: 'Merged into head' }); },
    onError: (e) => toast({ title: 'Merge refused', description: errMsg(e), variant: 'destructive' }),
  } });
  const stale = str(p, 'base') !== head;
  const open = p.status !== 'merged' && p.status !== 'deleted' && p.status !== 'revoked';
  return (
    <li className="rounded-xl border bg-card p-4" data-testid={`proposal-${p.id}`}>
      <div className="flex flex-wrap items-center gap-2">
        <GitPullRequestArrow className="h-4 w-4 text-primary" />
        <span className="font-semibold">{p.title}</span>
        <StatusPill status={p.status} />
        <span className="ml-auto font-mono text-[11px] text-muted-foreground">{when(p.createdAt)}</span>
      </div>
      <p className="mt-1 font-mono text-[11px] text-muted-foreground">{str(p, 'path')} · base {shortId(str(p, 'base'))}{stale && open ? ' (behind head)' : ''} · by {p.owner}</p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => setShow(!show)} data-testid={`button-view-proposal-${p.id}`}>{show ? 'Hide content' : 'Review content'}</Button>
        <RecordActions record={p} allowReport={false} />
      </div>
      {show && <pre className="mt-2 max-h-72 overflow-auto rounded-lg bg-[hsl(150_25%_12%)] p-3 font-mono text-xs leading-relaxed text-[hsl(60_25%_88%)]">{str(p, 'content')}</pre>}
      {canMerge && open && (
        <div className="mt-3 flex flex-wrap items-center gap-3 border-t pt-3">
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={reviewed} onCheckedChange={(v) => setReviewed(v === true)} data-testid={`checkbox-reviewed-${p.id}`} />
            I have read this change in full
          </label>
          <Button size="sm" disabled={!reviewed || merge.isPending} onClick={() => merge.mutate({ id: repoId, data: { proposalId: p.id, reviewed: true } })} data-testid={`button-merge-${p.id}`}>
            <GitMerge className="mr-1.5 h-3.5 w-3.5" />{merge.isPending ? 'Merging' : 'Merge'}
          </Button>
        </div>
      )}
    </li>
  );
}

function Runner() {
  const run = useRequestRun();
  return (
    <div className="rounded-2xl border border-dashed bg-card/60 p-4">
      <div className="flex items-center gap-2 text-sm font-semibold"><Play className="h-4 w-4 text-muted-foreground" /> Code runner</div>
      <p className="mt-1 text-xs text-muted-foreground">Files are text only and never executed in the browser. A sandboxed runner is not available on this server.</p>
      <Button variant="outline" size="sm" className="mt-3" disabled={run.isPending} onClick={() => run.mutate()} data-testid="button-request-run">Ask the server</Button>
      {run.isError && <p className="mt-2 font-mono text-xs text-destructive" data-testid="text-runner-result">{(run.error as { status?: number })?.status ?? ''} unavailable: {errMsg(run.error)}</p>}
      {run.isSuccess && <p className="mt-2 font-mono text-xs" data-testid="text-runner-result">Server responded; no job UI exists yet.</p>}
    </div>
  );
}

function Issues({ repoId }: { repoId: string }) {
  const issues = useRecords('issue').filter((i) => str(i, 'parentId') === repoId);
  const create = useCreate('Issue filed');
  const [t, setT] = useState('');
  const [b, setB] = useState('');
  return (
    <section aria-labelledby="issues-h" className="space-y-3">
      <h2 id="issues-h" className="text-lg font-bold">Issues</h2>
      {issues.length === 0 ? <p className="text-sm text-muted-foreground">No issues filed.</p> : (
        <ul className="space-y-2">{issues.map((i) => (
          <li key={i.id} className="rounded-xl border bg-card p-3" data-testid={`issue-${i.id}`}>
            <div className="flex items-center gap-2"><span className="font-semibold">{i.title}</span><StatusPill status={i.status} /></div>
            {i.body && <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">{i.body}</p>}
            <RecordActions record={i} />
          </li>))}
        </ul>
      )}
      <SignInGate what="file an issue">
        <form className="space-y-2" onSubmit={(e) => { e.preventDefault(); create.mutate({ data: { kind: 'issue', title: t.trim(), body: b, data: { parentId: repoId } } }, { onSuccess: () => { setT(''); setB(''); } }); }}>
          <label htmlFor="i-t" className="sr-only">Issue title</label>
          <input id="i-t" required maxLength={120} placeholder="Issue title" className={fieldClass} value={t} onChange={(e) => setT(e.target.value)} data-testid="input-issue-title" />
          <label htmlFor="i-b" className="sr-only">Issue details</label>
          <textarea id="i-b" placeholder="What did you observe?" className={`${fieldClass} min-h-20`} value={b} onChange={(e) => setB(e.target.value)} data-testid="input-issue-body" />
          <Button type="submit" size="sm" variant="outline" disabled={create.isPending || !t.trim()} data-testid="button-file-issue">File issue</Button>
        </form>
      </SignInGate>
    </section>
  );
}

export default function RepositoryDetail() {
  const { id = '' } = useParams<{ id: string }>();
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data: commons } = useCommons();
  const q = useGetRepository(id, { query: { enabled: !!id, queryKey: getGetRepositoryQueryKey(id), refetchInterval: 20000 } });
  const repo = q.data;
  const [path, setPath] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({ path: '', content: '', message: '' });

  const files = useMemo(() => [...(repo?.files ?? [])].sort((a, b) => a.path.localeCompare(b.path)), [repo?.files]);
  useEffect(() => { if (!path && files.length) setPath(files.find((f) => /readme/i.test(f.path))?.path ?? files[0].path); }, [files, path]);
  const file = files.find((f) => f.path === path);

  const propose = useProposeChange({ mutation: {
    onSuccess: () => { qc.invalidateQueries({ queryKey: getGetRepositoryQueryKey(id) }); setEditing(false); toast({ title: 'Proposal submitted', description: 'The owner reviews before anything merges.' }); },
    onError: (e) => toast({ title: 'Proposal refused', description: errMsg(e), variant: 'destructive' }),
  } });

  if (q.isLoading) return <div className="space-y-4"><Skeleton className="h-12 w-2/3" /><Skeleton className="h-80 w-full rounded-2xl" /></div>;
  if (q.isError || !repo) return <ErrorPanel error={q.error ?? new Error('Repository not found or not visible to you.')} onRetry={() => q.refetch()} />;

  const r = repo.repository;
  const canMerge = !!commons?.subject && commons.subject === r.owner;
  const startEdit = (p?: string) => {
    const f = files.find((x) => x.path === p);
    setDraft({ path: f?.path ?? '', content: f?.content ?? '', message: f ? `Update ${f.path}` : '' });
    setEditing(true);
  };

  return (
    <>
      <Link href="/repositories" className="mb-5 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground" data-testid="link-back-repos"><ArrowLeft className="h-3.5 w-3.5" /> All projects</Link>
      <header className="rise mb-6 border-b pb-6">
        <p className="font-mono text-xs text-primary">{r.owner} / {str(r, 'slug')}</p>
        <h1 className="mt-1 text-4xl font-extrabold">{r.title}</h1>
        <div className="mt-3 flex flex-wrap items-center gap-2"><StatusPill status={r.status} /><Tag>{str(r, 'visibility')}</Tag><Tag>{str(r, 'license')}</Tag><Tag>head {shortId(repo.head)}</Tag></div>
        <div className="mt-2"><RecordActions record={r} /></div>
      </header>

      <div className="grid gap-6 lg:grid-cols-[220px_1fr]">
        <nav aria-label="Files" className="space-y-1">
          <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Files · {files.length}</p>
          {files.map((f) => (
            <button key={f.path} type="button" onClick={() => { setPath(f.path); setEditing(false); }} aria-current={f.path === path} data-testid={`button-file-${f.path}`}
              className={cn('flex w-full items-center gap-2 truncate rounded-lg px-2.5 py-1.5 text-left font-mono text-xs transition-colors', f.path === path ? 'bg-primary text-primary-foreground' : 'hover:bg-secondary')}>
              <FileText className="h-3.5 w-3.5 shrink-0" /> <span className="truncate">{f.path}</span>
            </button>
          ))}
          <button type="button" onClick={() => startEdit()} className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs text-primary hover:bg-secondary" data-testid="button-new-file"><Plus className="h-3.5 w-3.5" /> Propose new file</button>
        </nav>

        <div className="min-w-0 space-y-6">
          {editing ? (
            <SignInGate what="propose a change">
              <form className="space-y-3 rounded-2xl border bg-card p-4" onSubmit={(e) => { e.preventDefault(); propose.mutate({ id, data: { base: repo.head, path: draft.path.trim(), content: draft.content, message: draft.message.trim() } }); }}>
                <p className="text-xs text-muted-foreground">Proposing against head <span className="font-mono">{shortId(repo.head)}</span>. Text only; nothing is executed.</p>
                <Field label="Path" htmlFor="e-path"><input id="e-path" required className={`${fieldClass} font-mono`} value={draft.path} onChange={(e) => setDraft({ ...draft, path: e.target.value })} data-testid="input-proposal-path" /></Field>
                <Field label="Content" htmlFor="e-content"><textarea id="e-content" spellCheck={false} maxLength={65536} className={`${fieldClass} ledger-lines min-h-80 font-mono text-[13px] leading-8`} value={draft.content} onChange={(e) => setDraft({ ...draft, content: e.target.value })} data-testid="input-proposal-content" /></Field>
                <Field label="Commit message" htmlFor="e-msg"><input id="e-msg" required maxLength={200} className={fieldClass} value={draft.message} onChange={(e) => setDraft({ ...draft, message: e.target.value })} data-testid="input-proposal-message" /></Field>
                <div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={() => setEditing(false)} data-testid="button-cancel-proposal">Cancel</Button><Button type="submit" disabled={propose.isPending || !draft.path.trim() || !draft.message.trim()} data-testid="button-submit-proposal">{propose.isPending ? 'Submitting' : 'Submit proposal'}</Button></div>
              </form>
            </SignInGate>
          ) : file ? (
            <div className="overflow-hidden rounded-2xl border bg-card">
              <div className="flex items-center justify-between border-b px-4 py-2"><span className="truncate font-mono text-xs">{file.path}</span><Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => startEdit(file.path)} data-testid="button-edit-file">Propose edit</Button></div>
              <pre className="max-h-[480px] overflow-auto p-4 font-mono text-[13px] leading-relaxed" data-testid="text-file-content">{file.content}</pre>
            </div>
          ) : <EmptyPlot title="No files at head.">This repository has no readable files yet.</EmptyPlot>}

          <section aria-labelledby="prop-h">
            <h2 id="prop-h" className="mb-3 text-lg font-bold">Proposals</h2>
            {repo.proposals.length === 0 ? <p className="text-sm text-muted-foreground">No proposals. Open a file and propose an edit.</p> : (
              <ul className="space-y-2">{repo.proposals.map((p) => <ProposalRow key={p.id} p={p} repoId={id} canMerge={canMerge} head={repo.head} />)}</ul>
            )}
            {!canMerge && repo.proposals.length > 0 && <p className="mt-2 text-xs text-muted-foreground">Only the repository owner can merge.</p>}
          </section>

          <div className="grid gap-6 md:grid-cols-2">
            <section aria-labelledby="hist-h">
              <h2 id="hist-h" className="mb-3 text-lg font-bold">History</h2>
              <ol className="relative space-y-3 border-l-2 border-secondary pl-4">
                {repo.commits.map((c) => (
                  <li key={c.oid} className="relative" data-testid={`commit-${c.oid}`}>
                    <GitCommitHorizontal className="absolute -left-[26px] top-0.5 h-4 w-4 rounded-full bg-background text-primary" />
                    <p className="text-sm font-medium">{c.message}</p>
                    <p className="font-mono text-[11px] text-muted-foreground">{shortId(c.oid, 10)} · {when(c.time)}</p>
                  </li>
                ))}
              </ol>
            </section>
            <div className="space-y-6"><Issues repoId={id} /><Runner /></div>
          </div>
        </div>
      </div>
    </>
  );
}
