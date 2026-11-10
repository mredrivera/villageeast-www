export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

const TZ = 'America/New_York';
export const fmtDate = (d: string | Date, opts: Intl.DateTimeFormatOptions = { dateStyle: 'long' }) =>
  new Intl.DateTimeFormat('en-US', { timeZone: TZ, ...opts }).format(typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d) ? new Date(d + 'T12:00:00Z') : new Date(d));
export const fmtDateTime = (d: string | Date) => fmtDate(d, { dateStyle: 'medium', timeStyle: 'short' });
export const fmtTime = (d: string | Date) => fmtDate(d, { timeStyle: 'short' });
export const fmtMoney = (n: number, digits = 0) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: digits, minimumFractionDigits: digits }).format(n);
export const fmtBytes = (n: number) => (n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

/** Parts used for calendar "date chips". */
export function dateParts(d: string | Date) {
  const date = new Date(d);
  return {
    month: fmtDate(date, { month: 'short' }),
    day: fmtDate(date, { day: 'numeric' }),
    weekday: fmtDate(date, { weekday: 'long' }),
    year: fmtDate(date, { year: 'numeric' }),
  };
}

/** Builds a redirect URL carrying a one-time flash message shown by the layout. */
export function withFlash(path: string, kind: 'ok' | 'error', message: string): string {
  const url = new URL(path, 'http://x');
  url.searchParams.set(kind, message);
  return url.pathname + url.search;
}
