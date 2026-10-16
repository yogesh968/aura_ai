import type { RecurringPayment } from '@aura/shared';
import { createEntity, updateEntity } from '@/lib/db/repo';
import { advanceDueDate } from './helpers';

/**
 * Record a bill payment: adds an expense transaction linked to the bill and
 * moves the bill's due date forward by one period. Bookkeeping only.
 */
export async function markBillPaid(bill: RecurringPayment, paidAt: Date = new Date()) {
  const tx = await createEntity('transaction', {
    kind: 'expense',
    amountMinor: bill.amountMinor,
    currency: bill.currency,
    category: bill.category,
    note: bill.name,
    occurredAt: paidAt.toISOString(),
    recurringId: bill.id,
  });
  const nextDueAt = advanceDueDate(bill.nextDueAt, bill.frequency);
  await updateEntity('recurringPayment', bill.id, { nextDueAt });
  return { tx, nextDueAt };
}
