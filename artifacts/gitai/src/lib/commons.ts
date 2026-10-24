import type { CommunityRecord } from '@workspace/api-client-react';

export const basePath = import.meta.env.BASE_URL.replace(/\/$/, '');

export function str(r: CommunityRecord, key: string): string {
  const v = r.data?.[key];
  return typeof v === 'string' ? v : typeof v === 'number' ? String(v) : '';
}

export function num(r: CommunityRecord, key: string): number | null {
  const v = r.data?.[key];
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

export function money(minor: number | null | undefined, currency = 'USD'): string {
  if (minor == null) return '—';
  return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(minor / 100);
}

export function toMinor(input: string): number | null {
  const n = Number(input.replace(/[^0-9.]/g, ''));
  if (!input.trim() || !Number.isFinite(n)) return null;
  return Math.round(n * 100);
}

export function when(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function shortId(s: string, n = 8): string {
  return s.length > n ? s.slice(0, n) : s;
}

export function errMsg(e: unknown): string {
  if (e && typeof e === 'object') {
    const anyE = e as { data?: unknown; message?: string; status?: number };
    if (anyE.data && typeof anyE.data === 'object' && 'error' in anyE.data) {
      const m = (anyE.data as { error: unknown }).error;
      if (typeof m === 'string') return m;
    }
    if (anyE.message) return anyE.message;
  }
  return 'Something went wrong.';
}

export function initials(s: string): string {
  const parts = s.trim().split(/\s+/).filter(Boolean);
  return (parts[0]?.[0] ?? '?').toUpperCase() + (parts[1]?.[0] ?? '').toUpperCase();
}

export const isLive = (status: string) => status === 'approved' || status === 'merged' || status === 'active';
