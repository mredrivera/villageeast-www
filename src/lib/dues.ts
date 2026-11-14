export const METHODS = ['check', 'cash', 'bank', 'other'] as const;
export type Method = (typeof METHODS)[number];
export const METHOD_LABEL: Record<Method, string> = { check: 'Check', cash: 'Cash', bank: 'Bank transfer', other: 'Other' };

export type DuesState = 'paid' | 'due' | 'overdue';
export const STATE_LABEL: Record<DuesState, string> = { paid: 'Paid', due: 'Not yet paid', overdue: 'Past due' };
export const STATE_BADGE: Record<DuesState, string> = { paid: 'badge-green', due: 'badge-amber', overdue: 'badge-red' };

/** Today's calendar date (YYYY-MM-DD) where the community is, so "past due" flips at local midnight. */
export function todayEastern(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

/** Dates are compared as YYYY-MM-DD strings; a payment is on time through the due date itself. */
export function duesState(paidOn: string | null, dueDate: string, today: string): DuesState {
  if (paidOn) return 'paid';
  return today > dueDate ? 'overdue' : 'due';
}

export const isIsoDate = (s: string): boolean => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`)) && new Date(`${s}T00:00:00Z`).toISOString().slice(0, 10) === s;

/** Parses a dollar amount typed into a form. Returns null unless it is a plain non-negative number. */
export function parseAmount(s: string): number | null {
  const t = s.trim().replace(/^\$/, '').replace(/,/g, '');
  return /^\d{1,6}(\.\d{1,2})?$/.test(t) ? Number(t) : null;
}

const addDays = (iso: string, days: number): string => new Date(Date.parse(`${iso}T00:00:00Z`) + days * 86400000).toISOString().slice(0, 10);

/**
 * Invented payment details for a demonstration dues year. Roughly five lots in six are shown as
 * paid, most of them before the due date. Never used for a real year.
 */
export function samplePayment(year: number, dueDate: string, today: string, rand: () => number = Math.random): { paid_on: string; method: Method; reference: string | null } | null {
  if (rand() > 0.84) return null;
  const start = `${year}-01-05`;
  const span = Math.max(1, Math.round((Date.parse(dueDate) - Date.parse(start)) / 86400000));
  let paidOn = rand() < 0.86 ? addDays(start, Math.floor(rand() * span)) : addDays(dueDate, 1 + Math.floor(rand() * 60));
  if (paidOn > today) paidOn = today;
  const r = rand();
  const method: Method = r < 0.8 ? 'check' : r < 0.95 ? 'bank' : 'cash';
  return { paid_on: paidOn, method, reference: method === 'check' ? `#${1000 + Math.floor(rand() * 9000)}` : null };
}

/** Sort key that groups properties by street, then house number ("105 CAMELOT DR" -> "CAMELOT DR 00105"). */
export function addressSortKey(address: string | null, section: string | null, label: string): string {
  const m = address?.match(/^(\d+)\s+(.*)$/);
  if (m) return `0 ${m[2]} ${m[1].padStart(6, '0')}`;
  return `1 ${address ?? ''} ${(section ?? '').padStart(3, '0')} ${label}`;
}
