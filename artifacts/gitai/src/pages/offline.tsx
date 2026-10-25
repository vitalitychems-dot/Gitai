import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Check, Copy } from 'lucide-react';
import { useCommons } from '@/hooks/use-commons';
import { PageHead } from '@/components/bits';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

const STEPS = [
  { t: 'Initialize a local logical node (once)', c: 'node tools/gitai-offline.mjs init runtime/node-alpha alpha' },
  { t: 'Draft a public drop', c: 'node tools/gitai-offline.mjs drop runtime/node-alpha community hello post "A public note"' },
  { t: 'Review, then approve the returned event ID', c: 'node tools/gitai-offline.mjs approve runtime/node-alpha EVENT_ID APPROVED' },
  { t: 'Export approved events only', c: 'node tools/gitai-offline.mjs export runtime/node-alpha runtime/alpha.bundle' },
  { t: 'Carry it by hand', c: 'USB drive, local network share, or any medium you control. No network service is involved.' , plain: true },
  { t: 'Initialize the receiving node (once)', c: 'node tools/gitai-offline.mjs init runtime/node-beta beta' },
  { t: 'Validate in quarantine and import as pending', c: 'node tools/gitai-offline.mjs import runtime/node-beta runtime/alpha.bundle' },
  { t: 'Inspect before local approval', c: 'node tools/gitai-offline.mjs state runtime/node-beta' },
  { t: 'Approve locally after reviewing the contents', c: 'node tools/gitai-offline.mjs approve runtime/node-beta EVENT_ID APPROVED' },
];

function Cmd({ c }: { c: string }) {
  const [done, setDone] = useState(false);
  return (
    <div className="mt-2 flex items-center gap-2 rounded-lg bg-[hsl(150_25%_12%)] p-3 font-mono text-[13px] text-[hsl(72_58%_75%)]">
      <code className="min-w-0 flex-1 overflow-x-auto whitespace-nowrap"><span className="select-none text-[hsl(60_25%_60%)]">$ </span>{c}</code>
      <Button size="sm" variant="ghost" aria-label="Copy command" className="h-7 w-7 p-0 text-[hsl(60_25%_88%)] hover:bg-white/10" data-testid="button-copy-cmd"
        onClick={() => { navigator.clipboard?.writeText(c).then(() => { setDone(true); setTimeout(() => setDone(false), 1500); }); }}>
        {done ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
      </Button>
    </div>
  );
}

export default function Offline() {
  const { data, isLoading } = useCommons();
  const caps = data ? Object.entries(data.capabilities) : [];
  return (
    <>
      <PageHead eyebrow="Offline exchange" title="Hand-carried, by design." lede={<>Communities without a reliable connection can exchange records manually. This is <strong className="text-foreground">CLI only</strong> for now; browser bundle upload is not supported yet.</>} />
      <div className="grid min-w-0 grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_300px]">
        <ol className="min-w-0 space-y-6">
          {STEPS.map((s, i) => (
            <li key={s.t} className="rise flex gap-4" style={{ animationDelay: `${i * 70}ms` }}>
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 border-primary font-display font-bold text-primary">{i + 1}</span>
              <div className="min-w-0 flex-1"><h2 className="font-bold">{s.t}</h2>{s.plain ? <p className="mt-1 text-sm text-muted-foreground">{s.c}</p> : <Cmd c={s.c} />}</div>
            </li>
          ))}
          <li className="rounded-2xl border border-dashed p-4 text-sm text-muted-foreground">Requires Linux, Node.js 20+, Git and prlimit. EVENT_ID is the checksum returned by the drop/import, not a signature. Bundles are unencrypted and source identity is unverified. This CLI exchanges public community events only, not browser records or private repository files. Offline nodes receive new data only after a transfer. No ports, discovery or live internet. Browser support and signed trust/revocation are pending.</li>
        </ol>
        <aside aria-labelledby="cap-h" className="h-fit min-w-0 rounded-2xl border bg-card p-5">
          <h2 id="cap-h" className="mb-3 font-bold">Capability status</h2>
          {isLoading ? <Skeleton className="h-32" /> : (
            <dl className="space-y-2">
              {caps.map(([k, v]) => (
                <div key={k} className="flex min-w-0 flex-col gap-1 text-sm" data-testid={`capability-${k}`}>
                  <dt className="capitalize text-muted-foreground">{k}</dt>
                  <dd className={cn('min-w-0 break-words rounded-md px-2 py-0.5 font-mono text-[11px]', /^(available|enabled|ready|cli)/i.test(v) ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground')}>{v}</dd>
                </div>
              ))}
            </dl>
          )}
          {data && <p className="mt-4 font-mono text-[10px] text-muted-foreground">observed {new Date(data.observedAt).toLocaleString()}</p>}
        </aside>
      </div>
    </>
  );
}
