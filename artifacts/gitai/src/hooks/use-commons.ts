import { useQueryClient } from '@tanstack/react-query';
import {
  useGetCommons,
  getGetCommonsQueryKey,
  useCreateRecord,
  useChangeRecord,
  type CommunityRecord,
} from '@workspace/api-client-react';
import { useToast } from '@/hooks/use-toast';
import { errMsg } from '@/lib/commons';

export function useCommons() {
  return useGetCommons({
    query: { queryKey: getGetCommonsQueryKey(), refetchInterval: 20000, refetchOnWindowFocus: true },
  });
}

export function useRecords(kind: string): CommunityRecord[] {
  const { data } = useCommons();
  return (data?.records ?? [])
    .filter((r) => r.kind === kind)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function useInvalidateCommons() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: getGetCommonsQueryKey() });
}

export function useCreate(successText: string) {
  const invalidate = useInvalidateCommons();
  const { toast } = useToast();
  return useCreateRecord({
    mutation: {
      onSuccess: () => {
        invalidate();
        toast({ title: successText });
      },
      onError: (e) => toast({ title: 'Not saved', description: errMsg(e), variant: 'destructive' }),
    },
  });
}

export function useChange() {
  const invalidate = useInvalidateCommons();
  const { toast } = useToast();
  return useChangeRecord({
    mutation: {
      onSuccess: (r) => {
        invalidate();
        toast({ title: `Recorded: ${r.title}`, description: `Status is now ${r.status}.` });
      },
      onError: (e) => toast({ title: 'Change refused', description: errMsg(e), variant: 'destructive' }),
    },
  });
}
