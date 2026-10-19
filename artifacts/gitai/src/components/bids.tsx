import { useState, type ReactNode } from 'react';
import type { BidActionOperatorKind, CommunityRecord } from '@workspace/api-client-react';
import { Button } from '@/components/ui/button';
import { Field, StatusPill, fieldClass } from '@/components/bits';
import { useSubmitBid, useBidAction } from '@/hooks/use-bids';
import { cn } from '@/lib/utils';
import { money, toMinor, when } from '@/lib/commons';
import { type Bid, type BidEvent, currentDelivery, isOverdue, short, toLocalInput } from '@/lib/bids';
import { AlertTriangle, Check, FileText, GitBranch, Plus, ShieldCheck, Trash2, X } from 'lucide-react';

type Kind = BidActionOperatorKind;

function Operator({ id, kind, label, ok, set, verb }: { id: string; kind: Kind; label: string; ok: boolean; verb: string; set: (p: { kind?: Kind; label?: string; ok?: boolean }) => void }) {
  return (
    <fieldset className="space-y-3 rounded-xl border border-dashed border-primary/40 bg-primary/5 p-4">
      <legend className="px-1 font-mono text-[11px] uppercase tracking-wider text-primary">Accountable operator</legend>
      <div className="flex gap-2" role="radiogroup" aria-label="Operator kind">
        {(['human', 'business'] as const).map((k) => (
          <button key={k} type="button" role="radio" aria-checked={kind === k} onClick={() => set({ kind: k })} data-testid={`radio-operator-${id}-${k}`}
            className={cn('rounded-full border px-3 py-1 text-xs capitalize', kind === k ? 'border-primary bg-primary text-primary-foreground' : 'hover:border-primary/50')}>{k}</button>
        ))}
      </div>
      <Field label={kind === 'business' ? 'Business legal name' : 'Your name'} htmlFor={`op-${id}`}>
        <input id={`op-${id}`} maxLength={100} className={fieldClass} value={label} onChange={(e) => set({ label: e.target.value })} data-testid={`input-operator-${id}`} />
      </Field>
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" className="mt-1" checked={ok} onChange={(e) => set({ ok: e.target.checked })} data-testid={`checkbox-consent-${id}`} />
        <span>I, the {kind} named above, am accountable for this agreement and {verb}. Any agent acting for me does so under my responsibility.</span>
      </label>
      <p className="text-xs text-muted-foreground">Self-reported identity, not verified onboarding or legal-payee approval. This is consent to work terms, not permission to spend.</p>
    </fieldset>
  );
}

type MsDraft = { title: string; scope: string; dueAt: string };

export function BidForm({ service, parent, onDone }: { service: CommunityRecord; parent?: Bid; onDone: () => void }) {
  const submit = useSubmitBid(onDone);
  const defDue = toLocalInput(new Date(Date.now() + 7 * 864e5));
  const [scope, setScope] = useState(parent ? '' : service.body);
  const [price, setPrice] = useState('');
  const [deadline, setDeadline] = useState(parent ? toLocalInput(new Date(parent.deadline)) : defDue);
  const [seller, setSeller] = useState('');
  const [ms, setMs] = useState<MsDraft[]>([{ title: '', scope: '', dueAt: deadline }]);
  const [op, setOp] = useState<{ kind: Kind; label: string; ok: boolean }>({ kind: 'human', label: '', ok: false });
  const minor = toMinor(price);
  const dl = new Date(deadline).getTime();
  const errs: string[] = [];
  if (!scope.trim()) errs.push('Scope is required.');
  if (!/^\d+(?:\.\d{1,2})?$/.test(price.trim()) || minor === null || minor < 1 || minor > 100000000) errs.push('Enter a subtotal above zero and at most $1,000,000, with up to two decimal places.');
  if (!(dl > Date.now())) errs.push('Deadline must be in the future.');
  if (parent && dl > new Date(parent.deadline).getTime()) errs.push('Subcontract deadline cannot pass the parent deadline.');
  if (parent && !/^[0-9a-f]{64}$/.test(seller)) errs.push('Designated seller must be a 64-character hex subject.');
  if (ms.some((m) => !m.title.trim() || !m.scope.trim())) errs.push('Every milestone needs a title and scope.');
  if (ms.some((m) => !(new Date(m.dueAt).getTime() <= dl))) errs.push('Milestones must be due on or before the deadline.');
  if (ms.some((m) => !(new Date(m.dueAt).getTime() > Date.now()))) errs.push('Every milestone deadline must be in the future.');
  if (!op.label.trim()) errs.push('Name the accountable operator.');
  if (!op.ok) errs.push('Affirm accountability to consent.');
  const p = `bid-${parent?.rec.id ?? service.id}`;
  return (
    <form className="mt-4 min-w-0 space-y-4 rounded-2xl border bg-background p-4 [overflow-wrap:anywhere] md:p-5 [&_select]:min-w-0 [&_select]:max-w-full" onSubmit={(e) => {
      e.preventDefault();
      if (errs.length || minor === null) return;
      submit.mutate({ data: {
        serviceId: service.id, ...(parent ? { parentBidId: parent.rec.id, sellerSubject: seller } : {}),
        scope: scope.trim(), subtotalMinor: minor, deadline: new Date(deadline).toISOString(),
        milestones: ms.map((m) => ({ title: m.title.trim(), scope: m.scope.trim(), dueAt: new Date(m.dueAt).toISOString() })),
        operatorKind: op.kind, operatorLabel: op.label.trim(), consent: true,
      } });
    }}>
      <p className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">{parent ? 'Upstream subcontract' : 'Private bid'} on {service.title}</p>
      {parent && (
        <Field label="Designated seller subject" htmlFor={`${p}-seller`} hint="The other operator who will do this part. You become their buyer; the original buyer also consents.">
          <input id={`${p}-seller`} className={`${fieldClass} font-mono text-xs`} value={seller} onChange={(e) => setSeller(e.target.value.trim().toLowerCase())} data-testid="input-subcontract-seller" />
        </Field>
      )}
      <Field label="Scope" htmlFor={`${p}-scope`}><textarea id={`${p}-scope`} maxLength={4000} className={`${fieldClass} min-h-24`} value={scope} onChange={(e) => setScope(e.target.value)} data-testid="input-bid-scope" /></Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Subtotal (USD)" htmlFor={`${p}-price`} hint="Buyer pays +4%, seller nets -4%."><input id={`${p}-price`} inputMode="decimal" className={`${fieldClass} font-mono`} value={price} onChange={(e) => setPrice(e.target.value)} data-testid="input-bid-price" /></Field>
        <Field label="Deadline" htmlFor={`${p}-dl`}><input id={`${p}-dl`} type="datetime-local" className={fieldClass} value={deadline} onChange={(e) => setDeadline(e.target.value)} data-testid="input-bid-deadline" /></Field>
      </div>
      {minor !== null && minor > 0 && (
        <p className="font-mono text-xs text-muted-foreground" data-testid="text-bid-quote">buyer total {money(minor + Math.round(minor * 0.04))} / seller net {money(minor - Math.round(minor * 0.04))} / platform {money(Math.round(minor * 0.04) * 2)} (estimate; exact calculation stored by server; no charge)</p>
      )}
      <div className="space-y-3">
        <div className="flex items-center justify-between"><p className="text-sm font-semibold">Milestones ({ms.length}/20)</p>
          <Button type="button" size="sm" variant="outline" disabled={ms.length >= 20} onClick={() => setMs([...ms, { title: '', scope: '', dueAt: deadline }])} data-testid="button-add-milestone"><Plus className="mr-1 h-3.5 w-3.5" />Milestone</Button></div>
        {ms.map((m, i) => (
          <div key={i} className="grid gap-2 rounded-lg border p-3 sm:grid-cols-[1fr_200px_auto]">
            <input aria-label={`Milestone ${i + 1} title`} placeholder={`Milestone ${i + 1} title`} maxLength={120} className={fieldClass} value={m.title} onChange={(e) => setMs(ms.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)))} data-testid={`input-milestone-title-${i}`} />
            <input aria-label={`Milestone ${i + 1} due`} type="datetime-local" className={fieldClass} value={m.dueAt} onChange={(e) => setMs(ms.map((x, j) => (j === i ? { ...x, dueAt: e.target.value } : x)))} data-testid={`input-milestone-due-${i}`} />
            <Button type="button" variant="ghost" size="icon" aria-label="Remove milestone" disabled={ms.length === 1} onClick={() => setMs(ms.filter((_, j) => j !== i))} data-testid={`button-remove-milestone-${i}`}><Trash2 className="h-4 w-4" /></Button>
            <textarea aria-label={`Milestone ${i + 1} scope`} placeholder="What this milestone delivers" maxLength={2000} className={`${fieldClass} sm:col-span-3`} value={m.scope} onChange={(e) => setMs(ms.map((x, j) => (j === i ? { ...x, scope: e.target.value } : x)))} data-testid={`input-milestone-scope-${i}`} />
          </div>
        ))}
      </div>
      <Operator id={p} kind={op.kind} label={op.label} ok={op.ok} verb="consent to these terms" set={(x) => setOp({ ...op, ...x })} />
      {errs.length > 0 && <ul className="space-y-0.5 text-xs text-muted-foreground" data-testid="list-bid-errors">{errs.map((e) => <li key={e}>{e}</li>)}</ul>}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">No money moves. No checkout, escrow or payout exists here.</p>
        <Button type="submit" disabled={errs.length > 0 || submit.isPending} data-testid="button-submit-bid">{submit.isPending ? 'Proposing' : parent ? 'Propose subcontract' : 'Propose bid'}</Button>
      </div>
    </form>
  );
}

function Who({ s, me }: { s: string; me?: string }) {
  return <span className="font-mono text-xs" title={s}>{s === me ? 'you' : short(s)}</span>;
}

function evLabel(e: BidEvent) { return `${e.action}${e.milestone != null ? ` m${e.milestone + 1}` : ''} by ${short(e.actor)} at ${when(e.at)}`; }

function NoteBox({ id, value, set, label = 'Note', optional }: { id: string; value: string; set: (v: string) => void; label?: string; optional?: boolean }) {
  return <Field label={optional ? `${label} (optional)` : label} htmlFor={id}><textarea id={id} maxLength={4000} className={`${fieldClass} min-h-20`} value={value} onChange={(e) => set(e.target.value)} data-testid={`input-${id}`} /></Field>;
}

function Panel({ title, children, tone }: { title: string; children: ReactNode; tone?: 'warn' }) {
  return <div className={cn('space-y-3 rounded-xl border p-4', tone === 'warn' ? 'border-destructive/40 bg-destructive/5' : 'bg-background')}><p className="text-sm font-semibold">{title}</p>{children}</div>;
}

const httpsOk = (u: string) => !u || /^https:\/\/[^\s]+$/.test(u);

function Actions({ b, me, services }: { b: Bid; me: string; services: CommunityRecord[] }) {
  const act = useBidAction();
  const id = b.rec.id;
  const st = b.rec.status;
  const isBuyer = me === b.buyer, isSeller = me === b.seller, party = isBuyer || isSeller;
  const [op, setOp] = useState<{ kind: Kind; label: string; ok: boolean }>({ kind: 'human', label: '', ok: false });
  const [dv, setDv] = useState<{ m: string; note: string; url: string; exec: '' | 'yes' | 'no' }>({ m: '', note: '', url: '', exec: '' });
  const [dec, setDec] = useState<Record<number, string>>({});
  const [dis, setDis] = useState({ ev: '', note: '' });
  const [evi, setEvi] = useState({ note: '', url: '' });
  const [res, setRes] = useState('');
  const [rv, setRv] = useState({ ev: '', note: '', rating: 0 });
  const [sub, setSub] = useState(false);
  const [withdrawNote, setWithdrawNote] = useState('');
  const run = (data: Parameters<typeof act.mutate>[0]['data'], reset?: () => void) => act.mutate({ id, data }, { onSuccess: () => reset?.() });
  const out: ReactNode[] = [];

  if (st === 'proposed' && b.participants.includes(me)) {
    if (!b.consents[me]) out.push(
      <Panel key="c" title="Your consent is required">
        <Operator id={`c-${id}`} kind={op.kind} label={op.label} ok={op.ok} verb="consent to every term shown" set={(x) => setOp({ ...op, ...x })} />
        <Button disabled={!op.ok || !op.label.trim() || act.isPending} onClick={() => run({ action: 'consent', operatorKind: op.kind, operatorLabel: op.label.trim() })} data-testid={`button-consent-${id}`}><ShieldCheck className="mr-1.5 h-4 w-4" />Consent</Button>
      </Panel>);
    out.push(<Panel key="w" title="Decline or withdraw proposed terms">
      <NoteBox id={`withdraw-note-${id}`} label="Withdrawal reason" value={withdrawNote} set={setWithdrawNote} />
      <Button variant="outline" disabled={act.isPending || !withdrawNote.trim()} onClick={() => { if (confirm('Withdraw this proposed agreement? This is recorded permanently.')) run({ action: 'withdraw', note: withdrawNote.trim() }); }} data-testid={`button-withdraw-${id}`}><X className="mr-1.5 h-4 w-4" />Withdraw</Button>
    </Panel>);
  }

  if (st === 'active' && isSeller) {
    const open = b.milestones.map((m, i) => ({ m, i })).filter(({ m, i }) => (m.status === 'pending' || m.status === 'rejected') && !currentDelivery(b, i));
    const ok = dv.m !== '' && dv.note.trim() && httpsOk(dv.url) && dv.exec !== '';
    out.push(
      <Panel key="d" title="Deliver a milestone">
        {open.length === 0 ? <p className="text-xs text-muted-foreground">Nothing awaiting delivery. Pending decisions sit with the buyer.</p> : <>
          <select aria-label="Milestone" className={fieldClass} value={dv.m} onChange={(e) => setDv({ ...dv, m: e.target.value })} data-testid={`select-deliver-milestone-${id}`}>
            <option value="">Choose milestone</option>{open.map(({ m, i }) => <option key={i} value={i}>{i + 1}. {m.title} ({m.status})</option>)}
          </select>
          <NoteBox id={`deliver-note-${id}`} label="Delivery note" value={dv.note} set={(v) => setDv({ ...dv, note: v })} />
          <Field label="Evidence URL (optional, HTTPS)" htmlFor={`deliver-url-${id}`} hint="Linked for reference only. GitAI never downloads or runs it."><input id={`deliver-url-${id}`} className={fieldClass} value={dv.url} onChange={(e) => setDv({ ...dv, url: e.target.value })} data-testid={`input-deliver-url-${id}`} /></Field>
          {!httpsOk(dv.url) && <p className="text-xs text-destructive">Evidence link must start with https://</p>}
          <div role="radiogroup" aria-label="Executable" className="space-y-1 text-sm">
            <p className="text-xs font-medium">Does this delivery contain executable material, including code or scripts? (required)</p>
            {([['no', 'No: evidence and manual text only'], ['yes', 'Yes: needs an isolated runner (unavailable, will be refused)']] as const).map(([v, l]) => (
              <label key={v} className="flex items-center gap-2"><input type="radio" name={`exec-${id}`} checked={dv.exec === v} onChange={() => setDv({ ...dv, exec: v })} data-testid={`radio-executable-${v}-${id}`} />{l}</label>
            ))}
          </div>
          <Button disabled={!ok || act.isPending} onClick={() => run({ action: 'deliver', milestone: Number(dv.m), note: dv.note.trim(), executable: dv.exec === 'yes', ...(dv.url ? { evidenceUrl: dv.url } : {}) }, () => setDv({ m: '', note: '', url: '', exec: '' }))} data-testid={`button-deliver-${id}`}>Record delivery</Button>
        </>}
      </Panel>);
    if (!b.parentBidId) {
      const svc = services.find((s) => s.id === b.serviceId);
      out.push(<div key="sub">{sub && svc ? <BidForm service={svc} parent={b} onDone={() => setSub(false)} /> : null}
        <Button variant="outline" className="mt-2" disabled={!svc} onClick={() => setSub(!sub)} data-testid={`button-subcontract-${id}`}><GitBranch className="mr-1.5 h-4 w-4" />{sub ? 'Close subcontract' : 'Subcontract upstream'}</Button></div>);
    }
  }

  if (st === 'active' && isBuyer) {
    b.milestones.forEach((m, i) => {
      const d = currentDelivery(b, i);
      if (!d) return;
      const note = dec[i] ?? '';
      out.push(
        <Panel key={`dec${i}`} title={`Decide on milestone ${i + 1}: ${m.title}`}>
          <p className="text-xs text-muted-foreground">Deciding on delivery {short(d.id)} ({when(d.at)}).</p>
          <NoteBox id={`decide-note-${id}-${i}`} label="Decision note" value={note} set={(v) => setDec({ ...dec, [i]: v })} />
          <div className="flex gap-2">
            <Button disabled={!note.trim() || act.isPending} onClick={() => run({ action: 'accept', milestone: i, note: note.trim(), eventId: d.id }, () => setDec({ ...dec, [i]: '' }))} data-testid={`button-accept-${id}-${i}`}><Check className="mr-1.5 h-4 w-4" />Accept</Button>
            <Button variant="outline" disabled={!note.trim() || act.isPending} onClick={() => run({ action: 'reject', milestone: i, note: note.trim(), eventId: d.id }, () => setDec({ ...dec, [i]: '' }))} data-testid={`button-reject-${id}-${i}`}><X className="mr-1.5 h-4 w-4" />Reject, allow resubmit</Button>
          </div>
        </Panel>);
    });
  }

  if (party && (st === 'active' || st === 'completed')) {
    const evs = b.events.filter((e) => ['deliver', 'accept', 'reject', 'evidence'].includes(e.action));
    out.push(
      <Panel key="dis" title="Open a dispute" tone="warn">
        {evs.length === 0 ? <p className="text-xs text-muted-foreground">A dispute must point at a recorded delivery or decision. None exists yet.</p> : <>
          <select aria-label="Disputed event" className={fieldClass} value={dis.ev} onChange={(e) => setDis({ ...dis, ev: e.target.value })} data-testid={`select-dispute-event-${id}`}>
            <option value="">Which event is disputed?</option>{evs.map((e) => <option key={e.id} value={e.id}>{evLabel(e)}</option>)}
          </select>
          <NoteBox id={`dispute-note-${id}`} label="What is wrong" value={dis.note} set={(v) => setDis({ ...dis, note: v })} />
          <Button variant="destructive" disabled={!dis.ev || !dis.note.trim() || act.isPending} onClick={() => run({ action: 'dispute', eventId: dis.ev, note: dis.note.trim() }, () => setDis({ ev: '', note: '' }))} data-testid={`button-dispute-${id}`}><AlertTriangle className="mr-1.5 h-4 w-4" />Dispute</Button>
        </>}
      </Panel>);
  }

  if (party && st === 'disputed') {
    out.push(
      <Panel key="evi" title="Add evidence">
        <NoteBox id={`evidence-note-${id}`} label="Evidence" value={evi.note} set={(v) => setEvi({ ...evi, note: v })} />
        <Field label="Evidence URL (optional, HTTPS)" htmlFor={`evidence-url-${id}`}><input id={`evidence-url-${id}`} className={fieldClass} value={evi.url} onChange={(e) => setEvi({ ...evi, url: e.target.value })} data-testid={`input-evidence-url-${id}`} /></Field>
        <Button variant="outline" disabled={!evi.note.trim() || !httpsOk(evi.url) || act.isPending} onClick={() => run({ action: 'evidence', note: evi.note.trim(), ...(evi.url ? { evidenceUrl: evi.url } : {}) }, () => setEvi({ note: '', url: '' }))} data-testid={`button-evidence-${id}`}><FileText className="mr-1.5 h-4 w-4" />Record evidence</Button>
      </Panel>,
      <Panel key="res" title="Propose a resolution">
        <p className="text-xs text-muted-foreground">Resolution closes the dispute by agreement. No funds move.</p>
        <NoteBox id={`resolution-note-${id}`} label="Proposed resolution" value={res} set={setRes} />
        <Button variant="outline" disabled={!res.trim() || act.isPending} onClick={() => run({ action: 'propose-resolution', note: res.trim() }, () => setRes(''))} data-testid={`button-propose-resolution-${id}`}>Propose</Button>
      </Panel>);
    if (b.resolution && !b.resolutionAgreements.includes(me)) out.push(
      <Panel key="agr" title="Agree to the current resolution">
        <p className="text-sm" data-testid={`text-resolution-${id}`}>{b.resolution.note}</p>
        <p className="font-mono text-[11px] text-muted-foreground">proposed by {short(b.resolution.actor)} / {short(b.resolution.id)}</p>
        <Button disabled={act.isPending} onClick={() => run({ action: 'agree-resolution', eventId: b.resolution!.id })} data-testid={`button-agree-resolution-${id}`}>Agree</Button>
      </Panel>);
  }

  if (party && (st === 'completed' || st === 'resolved') && !b.reviews.some((r) => r.actor === me)) {
    const evs = b.events.filter((e) => e.action === 'accept' || e.action === 'agree-resolution');
    out.push(
      <Panel key="rv" title="Review, tied to evidence">
        <select aria-label="Event reviewed" className={fieldClass} value={rv.ev} onChange={(e) => setRv({ ...rv, ev: e.target.value })} data-testid={`select-review-event-${id}`}>
          <option value="">Which accepted outcome?</option>{evs.map((e) => <option key={e.id} value={e.id}>{evLabel(e)}</option>)}
        </select>
        <div className="flex gap-1" role="radiogroup" aria-label="Rating">{[1, 2, 3, 4, 5].map((n) => (
          <button key={n} type="button" role="radio" aria-checked={rv.rating === n} onClick={() => setRv({ ...rv, rating: n })} data-testid={`radio-rating-${n}-${id}`}
            className={cn('h-8 w-8 rounded-md border font-mono text-sm', rv.rating >= n ? 'border-primary bg-primary text-primary-foreground' : '')}>{n}</button>))}</div>
        <NoteBox id={`review-note-${id}`} label="Review" value={rv.note} set={(v) => setRv({ ...rv, note: v })} />
        <Button disabled={!rv.ev || !rv.rating || !rv.note.trim() || act.isPending} onClick={() => run({ action: 'review', eventId: rv.ev, rating: rv.rating, note: rv.note.trim() })} data-testid={`button-review-${id}`}>Submit review</Button>
      </Panel>);
  }

  if (!out.length) return <p className="text-xs text-muted-foreground">No action is open to you at this status.</p>;
  return <div className="space-y-3">{act.isError && <p className="text-xs text-destructive" role="alert">Last action was refused. See the notice for detail.</p>}{out}</div>;
}

export function AgreementCard({ b, me, services, children }: { b: Bid; me: string; services: CommunityRecord[]; children?: ReactNode }) {
  const svc = services.find((s) => s.id === b.serviceId);
  const role = me === b.buyer ? 'buyer' : me === b.seller ? 'seller' : 'participant';
  return (
    <article id={`agreement-${b.rec.id}`} className="min-w-0 scroll-mt-6 rounded-2xl border bg-card p-5 [overflow-wrap:anywhere] md:p-6 [&_select]:min-w-0 [&_select]:max-w-full" data-testid={`card-bid-${b.rec.id}`}>
      <header className="flex flex-wrap items-center gap-2">
        <StatusPill status={b.rec.status} />
        <span className="rounded-md bg-accent px-1.5 py-0.5 font-mono text-[11px] uppercase text-accent-foreground">you are {role}</span>
        {b.parentBidId && <span className="font-mono text-[11px] text-muted-foreground">subcontract of {short(b.parentBidId)}</span>}
        <span className="ml-auto font-mono text-[11px] text-muted-foreground">{short(b.rec.id)} / {when(b.rec.createdAt)}</span>
      </header>
      <h3 className="mt-2 text-lg font-bold">{svc?.title ?? `Service ${short(b.serviceId)}`}</h3>
      <p className="mt-1 whitespace-pre-wrap text-sm">{b.scope}</p>
      <dl className="mt-4 grid gap-3 font-mono text-xs sm:grid-cols-4">
        <div><dt className="text-muted-foreground">subtotal</dt><dd className="text-base font-bold">{money(b.subtotalMinor)}</dd></div>
        <div><dt className="text-muted-foreground">buyer total (+4%)</dt><dd>{money(b.quote?.buyerTotalMinor)}</dd></div>
        <div><dt className="text-muted-foreground">seller net (-4%)</dt><dd>{money(b.quote?.sellerNetMinor)}</dd></div>
        <div><dt className="text-muted-foreground">platform gross</dt><dd>{money(b.quote?.platformGrossMinor)}</dd></div>
      </dl>
      <p className={cn('mt-2 font-mono text-xs', isOverdue(b.deadline, b.rec.status === 'completed' || b.rec.status === 'resolved' ? 'accepted' : '') ? 'text-destructive' : 'text-muted-foreground')}>deadline {when(b.deadline)}</p>
      <section className="mt-4"><p className="text-sm font-semibold">Participants and consent</p>
        <ul className="mt-2 space-y-1">{b.participants.map((p) => { const c = b.consents[p]; return (
          <li key={p} className="flex flex-wrap items-center gap-2 text-xs" data-testid={`row-consent-${b.rec.id}-${p.slice(0, 8)}`}>
            <Who s={p} me={me} /><span className="text-muted-foreground">{p === b.buyer ? 'buyer' : p === b.seller ? 'seller' : 'upstream buyer'}</span>
            {c ? <span className="text-primary">consented as {c.operatorKind} "{c.operatorLabel}" at {when(c.at)}</span> : <span className="text-destructive">awaiting consent</span>}
          </li>); })}</ul>
      </section>
      <section className="mt-4"><p className="text-sm font-semibold">Milestones</p>
        <ol className="mt-2 space-y-2">{b.milestones.map((m, i) => (
          <li key={i} className="rounded-lg border p-3 text-sm" data-testid={`row-milestone-${b.rec.id}-${i}`}>
            <div className="flex flex-wrap items-center gap-2"><span className="font-mono text-xs">{i + 1}.</span><span className="font-semibold">{m.title}</span><StatusPill status={m.status} />
              <span className={cn('ml-auto font-mono text-[11px]', isOverdue(m.dueAt, m.status) ? 'text-destructive' : 'text-muted-foreground')}>{isOverdue(m.dueAt, m.status) ? 'overdue ' : 'due '}{when(m.dueAt)}</span></div>
            <p className="mt-1 whitespace-pre-wrap text-xs text-muted-foreground">{m.scope}</p>
          </li>))}</ol>
      </section>
      <section className="mt-4"><p className="text-sm font-semibold">History (append-only)</p>
        <ol className="mt-2 space-y-1.5 border-l pl-4">{b.events.map((e) => (
          <li key={e.id} className="text-xs" data-testid={`row-event-${e.id}`}>
            <span className="font-mono font-semibold">{e.action}</span>{e.milestone != null && <span> on m{e.milestone + 1}</span>} by <Who s={e.actor} me={me} /> <span className="text-muted-foreground">{when(e.at)} / {short(e.id)}</span>
            {e.eventId && <span className="text-muted-foreground"> re {short(e.eventId)}</span>}
            {e.note && <p className="mt-0.5 whitespace-pre-wrap">{e.note}</p>}
            {e.evidenceUrl && <p className="mt-0.5 break-all font-mono text-muted-foreground">evidence link (not fetched): {e.evidenceUrl}</p>}
          </li>))}{b.events.length === 0 && <li className="text-xs text-muted-foreground">No events yet.</li>}</ol>
      </section>
      {b.resolution && <p className="mt-3 text-xs">Current resolution {short(b.resolution.id)}: {b.resolution.note} <span className="text-muted-foreground">(agreed by {b.resolutionAgreements.length ? b.resolutionAgreements.map(short).join(', ') : 'nobody yet'})</span></p>}
      {b.reviews.length > 0 && <section className="mt-4"><p className="text-sm font-semibold">Private reviews</p>
        <ul className="mt-2 space-y-1">{b.reviews.map((r) => <li key={r.actor} className="text-xs" data-testid={`row-review-${b.rec.id}-${r.actor.slice(0, 8)}`}><span className="font-mono">{r.rating}/5</span> by <Who s={r.actor} me={me} />, tied to event {short(r.eventId)}: {r.note}</li>)}</ul>
        <p className="mt-1 text-[11px] text-muted-foreground">Visible only to participants. Not a public reputation score.</p></section>}
      <section className="mt-5 border-t pt-4"><Actions b={b} me={me} services={services} /></section>
      {children}
    </article>
  );
}
