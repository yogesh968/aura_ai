import type { PendingAction } from '@aura/shared';

/** "in 23 h", "in 5 min", "in a moment", or "expired" for a future deadline. */
export function expiresIn(iso: string, now: Date = new Date()): string {
  const ms = new Date(iso).getTime() - now.getTime();
  if (!Number.isFinite(ms) || ms <= 0) return 'expired';
  const min = Math.round(ms / 60_000);
  if (min < 1) return 'in a moment';
  if (min < 60) return `in ${min} min`;
  const h = Math.round(min / 60);
  if (h < 48) return `in ${h} h`;
  return `in ${Math.round(h / 24)} d`;
}

/** Toast for the outcome of confirming/cancelling, one message per status. */
export function decisionMessage(status: PendingAction['status'], result: string | null): { kind: 'success' | 'error' | 'info'; text: string } {
  switch (status) {
    case 'confirmed':
      return { kind: 'success', text: result ?? 'Done' };
    case 'failed':
      return { kind: 'error', text: result ?? 'The action failed' };
    case 'rejected':
      return { kind: 'info', text: 'Cancelled — nothing was changed' };
    case 'expired':
      return { kind: 'info', text: 'This request expired. Ask again if you still want it.' };
    case 'pending':
      return { kind: 'info', text: 'Still waiting for confirmation' };
  }
}
