import { useQueryClient } from '@tanstack/react-query';
import { useCreateBid, useActOnBid, getGetCommonsQueryKey, getGetMyWorkQueryKey } from '@workspace/api-client-react';
import { useToast } from '@/hooks/use-toast';
import { errMsg } from '@/lib/commons';

export function useSubmitBid(onDone?: () => void) {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useCreateBid({
    mutation: {
      onSuccess: (r) => {
        qc.invalidateQueries({ queryKey: getGetCommonsQueryKey() });
        qc.invalidateQueries({ queryKey: getGetMyWorkQueryKey() });
        toast({ title: 'Bid proposed', description: `Agreement ${r.id.slice(0, 8)} is ${r.status}. Every participant must consent before it is active.` });
        onDone?.();
      },
      onError: (e) => toast({ title: 'Bid refused', description: errMsg(e), variant: 'destructive' }),
    },
  });
}

export function useBidAction(onDone?: () => void) {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useActOnBid({
    mutation: {
      onSuccess: (r, v) => {
        qc.invalidateQueries({ queryKey: getGetCommonsQueryKey() });
        qc.invalidateQueries({ queryKey: getGetMyWorkQueryKey() });
        toast({ title: `Recorded: ${v.data.action}`, description: `Agreement status is now ${r.status}.` });
        onDone?.();
      },
      onError: (e, v) => {
        qc.invalidateQueries({ queryKey: getGetCommonsQueryKey() });
        qc.invalidateQueries({ queryKey: getGetMyWorkQueryKey() });
        toast({ title: `${v.data.action} refused`, description: errMsg(e), variant: 'destructive' });
      },
    },
  });
}
