import { useState } from 'react';
import { Link, useLocation } from 'wouter';
import { Button } from '@/components/ui/button';
import { FolderGit2, Lock, Plus, Globe } from 'lucide-react';
import { useCommons, useCreate, useRecords } from '@/hooks/use-commons';
import { EmptyPlot, ErrorPanel, Field, ListSkeleton, PageHead, SignInGate, StatusPill, Tag, fieldClass } from '@/components/bits';
import { str, when } from '@/lib/commons';

const LICENSES = ['MIT', 'Apache-2.0', 'BSD-3-Clause', 'UNLICENSED'];
const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);

function CreateRepo() {
  const [, nav] = useLocation();
  const create = useCreate('Repository created with a first README commit');
  const [f, setF] = useState({ title: '', slug: '', body: '', visibility: 'private', license: 'MIT' });
  const [slugTouched, setSlugTouched] = useState(false);
  const slug = slugTouched ? f.slug : slugify(f.title);
  const valid = /^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug);
  return (
    <form className="rise space-y-4 rounded-2xl border bg-card p-5 md:p-6" onSubmit={(e) => {
      e.preventDefault();
      create.mutate({ data: { kind: 'repository', title: f.title.trim(), body: f.body, data: { slug, visibility: f.visibility, license: f.license } } }, { onSuccess: (r) => nav(`/repositories/${r.id}`) });
    }}>
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Name" htmlFor="r-title"><input id="r-title" required maxLength={120} className={fieldClass} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} data-testid="input-repo-title" /></Field>
        <Field label="Slug" htmlFor="r-slug" hint={valid ? 'lowercase-kebab-case' : 'Use lowercase letters, numbers and single hyphens'}>
          <input id="r-slug" required className={`${fieldClass} font-mono`} value={slug} onChange={(e) => { setSlugTouched(true); setF({ ...f, slug: e.target.value }); }} data-testid="input-repo-slug" />
        </Field>
        <Field label="Visibility" htmlFor="r-vis"><select id="r-vis" className={fieldClass} value={f.visibility} onChange={(e) => setF({ ...f, visibility: e.target.value })} data-testid="select-repo-visibility"><option value="private">private</option><option value="public">public</option></select></Field>
        <Field label="License" htmlFor="r-lic"><select id="r-lic" className={fieldClass} value={f.license} onChange={(e) => setF({ ...f, license: e.target.value })} data-testid="select-repo-license">{LICENSES.map((l) => <option key={l}>{l}</option>)}</select></Field>
      </div>
      <Field label="README description" htmlFor="r-body" hint="Written as the first commit in a private local Git object store. Nothing is pushed anywhere."><textarea id="r-body" className={`${fieldClass} min-h-24`} value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} data-testid="input-repo-body" /></Field>
      <div className="flex justify-end"><Button type="submit" disabled={create.isPending || !valid || !f.title.trim()} data-testid="button-create-repo">{create.isPending ? 'Committing' : 'Create repository'}</Button></div>
    </form>
  );
}

export default function Repositories() {
  const q = useCommons();
  const repos = useRecords('repository');
  const [open, setOpen] = useState(false);
  return (
    <>
      <PageHead eyebrow="Projects" title="Real code, real history." lede={<>Each project is a Git object database on this server. Changes arrive as proposals and are merged only after the owner marks them reviewed.</>}>
        <Button onClick={() => setOpen(!open)} data-testid="button-new-repo"><Plus className="mr-1.5 h-4 w-4" />{open ? 'Close' : 'New repository'}</Button>
      </PageHead>
      {q.data && <p className="mb-6 font-mono text-xs text-muted-foreground">Quota: up to {q.data.quotas.repositories} repositories, {Math.round(q.data.quotas.fileBytes / 1024)} KiB per file.</p>}
      {open && <div className="mb-8"><SignInGate what="create a repository"><CreateRepo /></SignInGate></div>}
      {q.isLoading ? <ListSkeleton /> : q.isError ? <ErrorPanel error={q.error} onRetry={() => q.refetch()} /> : repos.length === 0 ? (
        <EmptyPlot title="No repositories yet." action={!open && <Button variant="outline" onClick={() => setOpen(true)} data-testid="button-empty-repo">Start one</Button>}>
          Repositories appear here once they exist. Yours are visible to you right away, private or not.
        </EmptyPlot>
      ) : (
        <ul className="grid gap-4 md:grid-cols-2">
          {repos.map((r, i) => (
            <li key={r.id} className="rise" style={{ animationDelay: `${Math.min(i, 6) * 50}ms` }}>
              <Link href={`/repositories/${r.id}`} className="lift block h-full rounded-2xl border bg-card p-5" data-testid={`card-repo-${r.id}`}>
                <div className="flex items-center gap-2 text-muted-foreground">
                  <FolderGit2 className="h-4 w-4 text-primary" />
                  <span className="truncate font-mono text-xs">{str(r, 'slug')}</span>
                  <span className="ml-auto">{str(r, 'visibility') === 'public' ? <Globe className="h-3.5 w-3.5" aria-label="public" /> : <Lock className="h-3.5 w-3.5" aria-label="private" />}</span>
                </div>
                <h2 className="mt-3 text-xl font-bold">{r.title}</h2>
                {r.body && <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{r.body}</p>}
                <div className="mt-4 flex flex-wrap items-center gap-2"><Tag>{str(r, 'license')}</Tag><StatusPill status={r.status} /><span className="ml-auto font-mono text-[11px] text-muted-foreground">{when(r.createdAt)}</span></div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
