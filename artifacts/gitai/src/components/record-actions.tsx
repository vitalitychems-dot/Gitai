import { useState } from 'react';
import type { CommunityRecord } from '@workspace/api-client-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Check, Flag, Pencil, Trash2, Undo2 } from 'lucide-react';
import { useChange, useCommons, useCreate } from '@/hooks/use-commons';
import { Field, fieldClass } from '@/components/bits';

export function RecordActions({ record, allowReport = true }: { record: CommunityRecord; allowReport?: boolean }) {
  const { data: commons } = useCommons();
  const change = useChange();
  const report = useCreate('Report filed for owner review');
  const [editOpen, setEditOpen] = useState(false);
  const [delOpen, setDelOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [title, setTitle] = useState(record.title);
  const [body, setBody] = useState(record.body);
  const [reason, setReason] = useState('');

  if (!commons?.authenticated) return null;
  const mine = !!commons.subject && record.owner === commons.subject;
  const owner = !!commons.isOwner;
  const canApprove = owner && !['invitation', 'report', 'block', 'proposal'].includes(record.kind) && !['approved', 'deleted', 'revoked'].includes(record.status) && record.data.visibility !== 'private';
  const canRevoke = (owner && record.status === 'approved') || (mine && record.kind === 'invitation' && record.status === 'draft');
  const id = record.id;
  const btn = 'h-7 px-2 text-xs text-muted-foreground hover:text-foreground';

  return (
    <div className="flex flex-wrap items-center gap-0.5">
      {mine && (
        <>
          {!['repository', 'proposal'].includes(record.kind) && <Button variant="ghost" size="sm" className={btn} onClick={() => { setTitle(record.title); setBody(record.body); setEditOpen(true); }} data-testid={`button-edit-${id}`}>
            <Pencil className="mr-1 h-3 w-3" /> Edit
          </Button>}
          <Button variant="ghost" size="sm" className={btn} onClick={() => setDelOpen(true)} data-testid={`button-delete-${id}`}>
            <Trash2 className="mr-1 h-3 w-3" /> Withdraw
          </Button>
        </>
      )}
      {canApprove && (
        <Button variant="ghost" size="sm" className="h-7 px-2 text-xs text-primary" disabled={change.isPending} onClick={() => change.mutate({ id, data: { action: 'approve' } })} data-testid={`button-approve-${id}`}>
          <Check className="mr-1 h-3 w-3" /> Approve
        </Button>
      )}
      {canRevoke && (
        <Button variant="ghost" size="sm" className="h-7 px-2 text-xs text-destructive" disabled={change.isPending} onClick={() => change.mutate({ id, data: { action: 'revoke' } })} data-testid={`button-revoke-${id}`}>
          <Undo2 className="mr-1 h-3 w-3" /> Revoke
        </Button>
      )}
      {!mine && allowReport && (
        <Button variant="ghost" size="sm" className={btn} onClick={() => setReportOpen(true)} data-testid={`button-report-${id}`}>
          <Flag className="mr-1 h-3 w-3" /> Report
        </Button>
      )}

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="font-display">Edit “{record.title}”</DialogTitle>
            <DialogDescription>Edits return the item to pending review. Publishing again requires owner approval.</DialogDescription>
          </DialogHeader>
          <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); change.mutate({ id, data: { action: 'edit', title: title.trim(), body } }, { onSuccess: () => setEditOpen(false) }); }}>
            <Field label="Title" htmlFor={`t-${id}`}><input id={`t-${id}`} className={fieldClass} value={title} maxLength={120} required onChange={(e) => setTitle(e.target.value)} data-testid="input-edit-title" /></Field>
            <Field label="Body" htmlFor={`b-${id}`}><textarea id={`b-${id}`} className={`${fieldClass} min-h-32`} value={body} maxLength={10000} onChange={(e) => setBody(e.target.value)} data-testid="input-edit-body" /></Field>
            <DialogFooter><Button type="submit" disabled={change.isPending || !title.trim()} data-testid="button-save-edit">{change.isPending ? 'Saving' : 'Save edit'}</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={delOpen} onOpenChange={setDelOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Withdraw this item?</AlertDialogTitle>
            <AlertDialogDescription>This is a soft revoke: the item stops being shown, but the record of it existing is kept for accountability.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            <AlertDialogAction onClick={() => change.mutate({ id, data: { action: 'delete' } })} data-testid="button-confirm-delete">Withdraw</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={reportOpen} onOpenChange={setReportOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="font-display">Report to the owner</DialogTitle>
            <DialogDescription>Reports are private records for review. Nothing is removed automatically.</DialogDescription>
          </DialogHeader>
          <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); report.mutate({ data: { kind: 'report', title: `Report: ${record.title}`.slice(0, 120), body: reason, data: { parentId: id, reason } } }, { onSuccess: () => { setReason(''); setReportOpen(false); } }); }}>
            <Field label="What is wrong?" htmlFor={`r-${id}`}><textarea id={`r-${id}`} className={`${fieldClass} min-h-24`} required value={reason} onChange={(e) => setReason(e.target.value)} data-testid="input-report-reason" /></Field>
            <DialogFooter><Button type="submit" disabled={report.isPending || !reason.trim()} data-testid="button-submit-report">File report</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
