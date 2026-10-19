import { useState } from 'react';
import { useUser } from '@clerk/react';
import { useExportMyData, getExportMyDataQueryKey } from '@workspace/api-client-react';
import { Button } from '@/components/ui/button';
import { Download, MailPlus, ShieldAlert } from 'lucide-react';
import { useCommons, useCreate, useRecords } from '@/hooks/use-commons';
import { useToast } from '@/hooks/use-toast';
import { Field, PageHead, SignInGate, StatusPill, fieldClass } from '@/components/bits';
import { RecordActions } from '@/components/record-actions';
import { errMsg, str, when } from '@/lib/commons';

function Account() {
  const { user } = useUser();
  const { data } = useCommons();
  const rows: [string, string][] = [
    ['Email', user?.primaryEmailAddress?.emailAddress ?? '—'],
    ['Server subject', data?.subject ?? '—'],
    ['Owner controls', data?.isOwner ? 'yes' : 'no'],
    ['Record quota', data ? String(data.quotas.records) : '—'],
    ['Repository quota', data ? `${data.quotas.repositories} · ${Math.round(data.quotas.repositoryBytes / 1024)} KiB each` : '—'],
  ];
  return (
    <dl className="divide-y rounded-2xl border bg-card">
      {rows.map(([k, v]) => (
        <div key={k} className="flex flex-col gap-1 px-5 py-3 sm:flex-row sm:justify-between">
          <dt className="text-sm text-muted-foreground">{k}</dt>
          <dd className="truncate font-mono text-sm" data-testid={`text-account-${k.toLowerCase().replace(/\s/g, '-')}`}>{v}</dd>
        </div>
      ))}
    </dl>
  );
}

function Export() {
  const { toast } = useToast();
  const exp = useExportMyData({ query: { enabled: false, queryKey: getExportMyDataQueryKey() } });
  const go = async () => {
    const r = await exp.refetch();
    if (r.error || !r.data) { toast({ title: 'Export failed', description: errMsg(r.error), variant: 'destructive' }); return; }
    const blob = new Blob([JSON.stringify(r.data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `gitai-export-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
    toast({ title: `Exported ${r.data.records.length} records` });
  };
  return (
    <div className="rounded-2xl border bg-card p-5">
      <p className="text-sm text-muted-foreground">Download every record you own as JSON, including drafts and withdrawn items.</p>
      <Button className="mt-4" variant="outline" onClick={go} disabled={exp.isFetching} data-testid="button-export"><Download className="mr-1.5 h-4 w-4" />{exp.isFetching ? 'Preparing' : 'Export my data'}</Button>
    </div>
  );
}

function Invitations() {
  const mine = useRecords('invitation');
  const create = useCreate('Invitation drafted. Nothing was sent.');
  const [f, setF] = useState({ recipient: '', expires: '', role: 'member' });
  const min = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  return (
    <div className="space-y-4">
      <div className="flex gap-3 rounded-2xl border border-[hsl(38_60%_75%)] bg-[hsl(40_80%_94%)] p-4 text-sm text-[hsl(30_60%_25%)]">
        <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
        <p>Admission is closed. An invitation here is a draft record only. It is never emailed, never sent, and admits nobody.</p>
      </div>
      <form className="grid gap-4 rounded-2xl border bg-card p-5 sm:grid-cols-3" onSubmit={(e) => {
        e.preventDefault();
        create.mutate({ data: { kind: 'invitation', title: `Invitation for ${f.recipient.trim()}`.slice(0, 120), body: '', data: { recipient: f.recipient.trim(), expiresAt: new Date(`${f.expires}T23:59:59Z`).toISOString(), role: f.role, scope: 'community-only' } } }, { onSuccess: () => setF({ ...f, recipient: '' }) });
      }}>
        <Field label="Recipient" htmlFor="inv-r"><input id="inv-r" required className={fieldClass} value={f.recipient} onChange={(e) => setF({ ...f, recipient: e.target.value })} data-testid="input-invite-recipient" /></Field>
        <Field label="Expires" htmlFor="inv-e"><input id="inv-e" type="date" required min={min} className={fieldClass} value={f.expires} onChange={(e) => setF({ ...f, expires: e.target.value })} data-testid="input-invite-expires" /></Field>
        <Field label="Role" htmlFor="inv-role"><select id="inv-role" className={fieldClass} value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })} data-testid="select-invite-role"><option value="member">member</option><option value="moderator">moderator</option></select></Field>
        <div className="sm:col-span-3 flex justify-end"><Button type="submit" disabled={create.isPending || !f.recipient.trim() || !f.expires} data-testid="button-draft-invite"><MailPlus className="mr-1.5 h-4 w-4" />Draft invitation</Button></div>
      </form>
      {mine.length === 0 ? <p className="text-sm text-muted-foreground">You have no invitation drafts.</p> : (
        <ul className="divide-y rounded-2xl border bg-card">
          {mine.map((i) => (
            <li key={i.id} className="flex flex-wrap items-center gap-2 px-5 py-3" data-testid={`invite-${i.id}`}>
              <span className="font-medium">{str(i, 'recipient')}</span>
              <span className="font-mono text-xs text-muted-foreground">{str(i, 'role')} · expires {when(str(i, 'expiresAt'))}</span>
              <StatusPill status={i.status} />
              <span className="ml-auto"><RecordActions record={i} allowReport={false} /></span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function SettingsPage() {
  return (
    <>
      <PageHead eyebrow="Settings" title="Your account, your records." lede="Everything you write is yours to export or withdraw." />
      <SignInGate what="manage your account">
        <div className="space-y-10">
          <section aria-labelledby="s-acc" className="space-y-3"><h2 id="s-acc" className="text-xl font-bold">Account</h2><Account /></section>
          <section aria-labelledby="s-exp" className="space-y-3"><h2 id="s-exp" className="text-xl font-bold">Data export</h2><Export /></section>
          <section aria-labelledby="s-inv" className="space-y-3"><h2 id="s-inv" className="text-xl font-bold">Invitation drafts</h2><Invitations /></section>
        </div>
      </SignInGate>
    </>
  );
}
