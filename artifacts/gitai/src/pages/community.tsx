import { useMemo, useState } from 'react';
import type { CommunityRecord } from '@workspace/api-client-react';
import { Button } from '@/components/ui/button';
import { ExternalLink, MessageSquareReply, PenLine } from 'lucide-react';
import { useCommons, useCreate, useRecords } from '@/hooks/use-commons';
import { EmptyPlot, ErrorPanel, Field, ListSkeleton, PageHead, SignInGate, StatusPill, Tag, fieldClass } from '@/components/bits';
import { RecordActions } from '@/components/record-actions';
import { cn } from '@/lib/utils';
import { str, when } from '@/lib/commons';

const LABELS = ['opinion', 'reporting', 'evidence', 'ai-summary'] as const;

function Composer({ onDone }: { onDone: () => void }) {
  const create = useCreate('Post drafted. It stays pending until approved.');
  const [f, setF] = useState({ topic: '', label: 'opinion', title: '', body: '', sourceUrl: '' });
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  const badUrl = f.sourceUrl !== '' && !/^https:\/\/\S+$/.test(f.sourceUrl);
  return (
    <form className="rise space-y-4 rounded-2xl border bg-card p-5 md:p-6" onSubmit={(e) => {
      e.preventDefault();
      const data: Record<string, string> = { topic: f.topic.trim().toLowerCase(), label: f.label };
      if (f.sourceUrl) data.sourceUrl = f.sourceUrl;
      create.mutate({ data: { kind: 'post', title: f.title.trim(), body: f.body, data } }, { onSuccess: () => { setF({ ...f, title: '', body: '', sourceUrl: '' }); onDone(); } });
    }}>
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Topic" htmlFor="p-topic" hint="One word or short phrase, e.g. tooling"><input id="p-topic" required className={fieldClass} value={f.topic} onChange={set('topic')} data-testid="input-post-topic" /></Field>
        <Field label="What kind of claim is this?" htmlFor="p-label">
          <select id="p-label" className={fieldClass} value={f.label} onChange={set('label')} data-testid="select-post-label">
            {LABELS.map((l) => <option key={l} value={l}>{l}</option>)}
          </select>
        </Field>
      </div>
      <Field label="Title" htmlFor="p-title"><input id="p-title" required maxLength={120} className={fieldClass} value={f.title} onChange={set('title')} data-testid="input-post-title" /></Field>
      <Field label="Body" htmlFor="p-body"><textarea id="p-body" maxLength={10000} className={`${fieldClass} min-h-32`} value={f.body} onChange={set('body')} data-testid="input-post-body" /></Field>
      <Field label="Source URL (optional)" htmlFor="p-src" hint={badUrl ? 'Must start with https://' : 'Evidence and reporting read better with a source.'}>
        <input id="p-src" type="url" className={cn(fieldClass, badUrl && 'border-destructive')} value={f.sourceUrl} onChange={set('sourceUrl')} data-testid="input-post-source" />
      </Field>
      <div className="flex justify-end"><Button type="submit" disabled={create.isPending || badUrl || !f.title.trim() || !f.topic.trim()} data-testid="button-submit-post">{create.isPending ? 'Drafting' : 'Submit for approval'}</Button></div>
    </form>
  );
}

function ReplyBox({ parentId, onDone }: { parentId: string; onDone: () => void }) {
  const create = useCreate('Comment recorded');
  const [text, setText] = useState('');
  return (
    <form className="mt-3 flex flex-col gap-2 sm:flex-row" onSubmit={(e) => {
      e.preventDefault();
      create.mutate({ data: { kind: 'comment', title: text.trim().slice(0, 80) || 'Comment', body: text, data: { parentId } } }, { onSuccess: () => { setText(''); onDone(); } });
    }}>
      <label htmlFor={`reply-${parentId}`} className="sr-only">Reply</label>
      <textarea id={`reply-${parentId}`} autoFocus required rows={2} className={`${fieldClass} flex-1`} value={text} onChange={(e) => setText(e.target.value)} placeholder="Add to the thread" data-testid={`input-reply-${parentId}`} />
      <Button type="submit" size="sm" disabled={create.isPending || !text.trim()} data-testid={`button-reply-${parentId}`}>Reply</Button>
    </form>
  );
}

function Thread({ parentId, byParent, depth }: { parentId: string; byParent: Map<string, CommunityRecord[]>; depth: number }) {
  const kids = byParent.get(parentId) ?? [];
  const [replying, setReplying] = useState<string | null>(null);
  if (!kids.length) return null;
  return (
    <ol className={cn('space-y-3', depth > 0 && 'ml-3 border-l-2 border-secondary pl-4 md:ml-5')}>
      {kids.map((c) => (
        <li key={c.id} data-testid={`comment-${c.id}`}>
          <div className="rounded-xl bg-background/70 p-3">
            <div className="flex flex-wrap items-center gap-2 font-mono text-[11px] text-muted-foreground">
              <span className="truncate">{c.owner}</span><span>·</span><time>{when(c.createdAt)}</time>
              {c.status !== 'approved' && <StatusPill status={c.status} />}
            </div>
            <p className="mt-1.5 whitespace-pre-wrap text-sm leading-relaxed">{c.body || c.title}</p>
            <div className="mt-1 flex flex-wrap items-center gap-1">
              {depth < 4 && (
                <Button variant="ghost" size="sm" className="h-7 px-2 text-xs text-muted-foreground" onClick={() => setReplying(replying === c.id ? null : c.id)} data-testid={`button-open-reply-${c.id}`}>
                  <MessageSquareReply className="mr-1 h-3 w-3" /> Reply
                </Button>
              )}
              <RecordActions record={c} />
            </div>
            {replying === c.id && <SignInGate what="reply"><ReplyBox parentId={c.id} onDone={() => setReplying(null)} /></SignInGate>}
          </div>
          <div className="mt-3"><Thread parentId={c.id} byParent={byParent} depth={depth + 1} /></div>
        </li>
      ))}
    </ol>
  );
}

function PostCard({ post, byParent, i }: { post: CommunityRecord; byParent: Map<string, CommunityRecord[]>; i: number }) {
  const [replying, setReplying] = useState(false);
  const count = (byParent.get(post.id) ?? []).length;
  const src = str(post, 'sourceUrl');
  return (
    <article className="rise rounded-2xl border bg-card p-5 md:p-6" style={{ animationDelay: `${Math.min(i, 6) * 50}ms` }} data-testid={`card-post-${post.id}`}>
      <div className="flex flex-wrap items-center gap-2">
        <Tag>#{str(post, 'topic') || 'general'}</Tag>
        <span className="rounded-md border border-accent-foreground/20 bg-accent px-1.5 py-0.5 font-mono text-[11px] text-accent-foreground">{str(post, 'label') || 'unlabelled'}</span>
        <StatusPill status={post.status} />
        <span className="ml-auto font-mono text-[11px] text-muted-foreground">{when(post.createdAt)}</span>
      </div>
      <h2 className="mt-3 text-2xl font-bold leading-tight">{post.title}</h2>
      <p className="mt-1 font-mono text-[11px] text-muted-foreground">by {post.owner}</p>
      {post.body && <p className="mt-3 whitespace-pre-wrap text-[15px] leading-relaxed text-foreground/90">{post.body}</p>}
      {src && <a href={src} target="_blank" rel="noreferrer noopener" className="mt-3 inline-flex items-center gap-1 text-sm text-primary underline-offset-4 hover:underline" data-testid={`link-source-${post.id}`}>Source <ExternalLink className="h-3 w-3" /></a>}
      <div className="mt-4 flex flex-wrap items-center gap-1 border-t pt-3">
        <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => setReplying(!replying)} data-testid={`button-comment-${post.id}`}>
          <MessageSquareReply className="mr-1 h-3 w-3" /> Comment {count > 0 && <span className="ml-1 font-mono text-muted-foreground">{count}</span>}
        </Button>
        <RecordActions record={post} />
      </div>
      {replying && <SignInGate what="comment"><ReplyBox parentId={post.id} onDone={() => setReplying(false)} /></SignInGate>}
      <div className="mt-4"><Thread parentId={post.id} byParent={byParent} depth={0} /></div>
    </article>
  );
}

export default function Community() {
  const q = useCommons();
  const posts = useRecords('post');
  const comments = useRecords('comment');
  const [topic, setTopic] = useState<string | null>(null);
  const [composing, setComposing] = useState(false);
  const byParent = useMemo(() => {
    const m = new Map<string, CommunityRecord[]>();
    [...comments].reverse().forEach((c) => { const p = str(c, 'parentId'); m.set(p, [...(m.get(p) ?? []), c]); });
    return m;
  }, [comments]);
  const topics = useMemo(() => Array.from(new Set(posts.map((p) => str(p, 'topic')).filter(Boolean))).sort(), [posts]);
  const shown = topic ? posts.filter((p) => str(p, 'topic') === topic) : posts;

  return (
    <>
      <PageHead eyebrow="Community" title="The commons, in public." lede={<>Topic posts labelled by the kind of claim they make. New posts wait for approval; you can always see your own drafts.</>}>
        <Button onClick={() => setComposing(!composing)} data-testid="button-new-post"><PenLine className="mr-1.5 h-4 w-4" />{composing ? 'Close' : 'New post'}</Button>
      </PageHead>
      {composing && <div className="mb-8"><SignInGate what="post"><Composer onDone={() => setComposing(false)} /></SignInGate></div>}
      {topics.length > 0 && (
        <div className="mb-6 flex flex-wrap gap-2" role="group" aria-label="Filter by topic">
          {[null, ...topics].map((t) => (
            <button key={t ?? 'all'} type="button" aria-pressed={topic === t} onClick={() => setTopic(t)} data-testid={`filter-topic-${t ?? 'all'}`}
              className={cn('rounded-full border px-3 py-1 text-xs transition-colors', topic === t ? 'border-primary bg-primary text-primary-foreground' : 'bg-card hover:border-primary/50')}>
              {t ? `#${t}` : 'All topics'}
            </button>
          ))}
        </div>
      )}
      {q.isLoading ? <ListSkeleton /> : q.isError ? <ErrorPanel error={q.error} onRetry={() => q.refetch()} /> : shown.length === 0 ? (
        <EmptyPlot title="Nothing has been planted here yet." action={!composing && <Button variant="outline" onClick={() => setComposing(true)} data-testid="button-empty-post">Write the first post</Button>}>
          No approved posts exist. That is the honest state of the commons today — nothing has been seeded for show.
        </EmptyPlot>
      ) : (
        <div className="space-y-5">{shown.map((p, i) => <PostCard key={p.id} post={p} byParent={byParent} i={i} />)}</div>
      )}
    </>
  );
}
