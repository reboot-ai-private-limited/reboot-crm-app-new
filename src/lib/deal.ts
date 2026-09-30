/**
 * Deal close = service lines (backend/docs/02-BUSINESS-RULES.md §8.1). Mirrors the backend
 * maths (backend/src/modules/lead/domain/deal.ts) so the form shows the totals it will save.
 */

export type TaxType = 'NONE' | 'GST_18';
export const TAX_LABEL: Record<TaxType, string> = { NONE: 'No GST', GST_18: 'GST 18%' };
const TAX_RATE: Record<TaxType, number> = { NONE: 0, GST_18: 0.18 };

export const PAYMENT_METHODS = [
  { value: 'CASH', label: 'Cash' },
  { value: 'UPI', label: 'UPI' },
  { value: 'BANK_TRANSFER', label: 'Bank' },
  { value: 'CHEQUE', label: 'Cheque' },
  { value: 'OTHER', label: 'Other' },
] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number]['value'];

/** One line as typed in the form. */
export type DealLineForm = { key: string; serviceId: string; serviceName: string; amount: string; discount: string; taxType: TaxType; expiry: Date | null };

export type DealForm = {
  lines: DealLineForm[];
  dueDate: Date;
  notes: string;
  advance: { on: boolean; amount: string; date: Date; method: PaymentMethod; referenceId: string };
};

const money = (n: number) => Math.round(n * 100) / 100;

let seq = 0;
export const emptyLine = (): DealLineForm => ({ key: `l${++seq}`, serviceId: '', serviceName: '', amount: '', discount: '', taxType: 'NONE', expiry: null });

export function newDealForm(): DealForm {
  const due = new Date();
  due.setDate(due.getDate() + 7);
  due.setHours(0, 0, 0, 0);
  return { lines: [emptyLine()], dueDate: due, notes: '', advance: { on: false, amount: '', date: new Date(), method: 'UPI', referenceId: '' } };
}

export function lineTotals(l: DealLineForm) {
  const amount = Number(l.amount) || 0;
  const discount = Number(l.discount) || 0;
  const finalAmount = money(Math.max(0, amount - discount));
  const taxAmount = money(finalAmount * TAX_RATE[l.taxType]);
  return { amount, discount, finalAmount, taxAmount, lineTotal: money(finalAmount + taxAmount) };
}

export function dealTotal(lines: DealLineForm[]) {
  return money(lines.reduce((s, l) => s + lineTotals(l).lineTotal, 0));
}

const startOfToday = () => new Date(new Date().setHours(0, 0, 0, 0));

export function lineError(l: DealLineForm): string | undefined {
  if (!l.serviceId) return 'Choose a service';
  const { amount, discount } = lineTotals(l);
  if (!(amount > 0)) return `Enter the amount for ${l.serviceName}`;
  if (discount < 0 || discount > amount) return `Discount for ${l.serviceName} must be between 0 and the amount`;
  if (l.expiry && l.expiry <= startOfToday()) return `Expiry for ${l.serviceName} must be after today`;
  return undefined;
}

/** First problem with the whole form, or undefined. */
export function dealError(f: DealForm): string | undefined {
  const bad = f.lines.map(lineError).find(Boolean);
  if (bad) return bad;
  const total = dealTotal(f.lines);
  if (!(total > 0)) return 'The deal total must be more than 0';
  if (f.advance.on) {
    const a = Number(f.advance.amount);
    if (!(a > 0)) return 'Enter the advance amount';
    if (a > total) return 'Advance cannot be more than the deal total';
  }
  return undefined;
}

/** Body fields for PATCH /leads/:id/status with status DEAL_CLOSED. */
export function dealPayload(f: DealForm) {
  return {
    services: f.lines.map((l) => ({
      serviceId: l.serviceId,
      amount: Number(l.amount),
      discount: Number(l.discount) || 0,
      taxType: l.taxType,
      ...(l.expiry ? { expiryDate: l.expiry.toISOString() } : {}),
    })),
    dueDate: f.dueDate.toISOString(),
    ...(f.notes.trim() ? { notes: f.notes.trim() } : {}),
    ...(f.advance.on
      ? {
          advance: {
            amount: Number(f.advance.amount),
            date: f.advance.date.toISOString(),
            method: f.advance.method,
            ...(f.advance.referenceId.trim() ? { referenceId: f.advance.referenceId.trim() } : {}),
          },
        }
      : {}),
  };
}
