/**
 * A small declarative form engine shared by surveys (definitions stored in the database) and
 * request forms (definitions in code). One schema drives rendering, server-side validation and
 * the admin tallies, so the three can never drift apart.
 */
export type Option = { value: string; label: string };

type Base = { name: string; label: string; help?: string; required?: boolean };
export type Field =
  | { type: 'section'; label: string; help?: string }
  | (Base & { type: 'text' | 'email' | 'tel' | 'date'; placeholder?: string; maxLength?: number; autocomplete?: string })
  | (Base & { type: 'textarea'; placeholder?: string; maxLength?: number; rows?: number })
  | (Base & { type: 'number'; min?: number; max?: number; step?: number })
  | (Base & { type: 'select' | 'radio'; options: Option[] })
  | (Base & { type: 'checkboxes'; options: Option[]; max?: number })
  | (Base & { type: 'boolean' })
  | (Base & { type: 'scale'; min: number; max: number; minLabel?: string; maxLabel?: string })
  | (Base & { type: 'files'; accept: string[]; maxFiles: number; maxBytes: number });

export type InputField = Exclude<Field, { type: 'section' }>;
export type AnswerValue = string | number | boolean | string[] | null;
export type Answers = Record<string, AnswerValue>;
export type ValidationResult = { ok: boolean; answers: Answers; files: Record<string, File[]>; errors: Record<string, string> };

export const isInput = (f: Field): f is InputField => f.type !== 'section';

const FIELD_TYPES = new Set(['section', 'text', 'email', 'tel', 'date', 'textarea', 'number', 'select', 'radio', 'checkboxes', 'boolean', 'scale', 'files']);
const NAME_RE = /^[a-z][a-z0-9_]{0,39}$/;

/** Validates a schema authored by an admin (surveys). Returns an error message or null. */
export function checkSchema(input: unknown): string | null {
  if (!Array.isArray(input) || input.length === 0) return 'The form needs at least one field.';
  if (input.length > 80) return 'Too many fields (max 80).';
  const seen = new Set<string>();
  for (const [i, f] of input.entries()) {
    const at = `Field ${i + 1}`;
    if (typeof f !== 'object' || f === null) return `${at}: must be an object.`;
    const o = f as Record<string, unknown>;
    if (typeof o.type !== 'string' || !FIELD_TYPES.has(o.type)) return `${at}: unknown type "${String(o.type)}".`;
    if (typeof o.label !== 'string' || o.label.trim() === '' || o.label.length > 300) return `${at}: needs a label (max 300 characters).`;
    if (o.type === 'section') continue;
    if (o.type === 'files') return `${at}: file uploads are not available in surveys.`;
    if (typeof o.name !== 'string' || !NAME_RE.test(o.name)) return `${at}: "name" must be lower-case letters, digits or underscores.`;
    if (seen.has(o.name)) return `${at}: duplicate name "${o.name}".`;
    seen.add(o.name);
    if (o.type === 'select' || o.type === 'radio' || o.type === 'checkboxes') {
      if (!Array.isArray(o.options) || o.options.length < 1 || o.options.length > 60) return `${at}: needs between 1 and 60 options.`;
      for (const opt of o.options as unknown[]) {
        const v = opt as Record<string, unknown>;
        if (typeof v?.value !== 'string' || typeof v?.label !== 'string' || v.value === '' || v.value.length > 80 || v.label.length > 200) {
          return `${at}: each option needs a "value" and a "label".`;
        }
      }
    }
    if (o.type === 'scale') {
      if (!Number.isInteger(o.min) || !Number.isInteger(o.max) || (o.max as number) <= (o.min as number) || (o.max as number) - (o.min as number) > 10) {
        return `${at}: scale needs whole-number min and max (at most 11 steps).`;
      }
    }
  }
  return seen.size === 0 ? 'The form needs at least one question.' : null;
}

const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/;

function magicBytesOk(bytes: Uint8Array, mime: string): boolean {
  const starts = (...sig: number[]) => sig.every((b, i) => bytes[i] === b);
  switch (mime) {
    case 'application/pdf': return starts(0x25, 0x50, 0x44, 0x46);
    case 'image/jpeg': return starts(0xff, 0xd8, 0xff);
    case 'image/png': return starts(0x89, 0x50, 0x4e, 0x47);
    case 'image/webp': return starts(0x52, 0x49, 0x46, 0x46) && bytes[8] === 0x57 && bytes[9] === 0x45;
    default: return false;
  }
}

/** Validates a submitted form against its schema. Never trusts the browser: every rule is re-checked here. */
export async function validateForm(fields: Field[], form: FormData): Promise<ValidationResult> {
  const answers: Answers = {};
  const files: Record<string, File[]> = {};
  const errors: Record<string, string> = {};

  for (const f of fields) {
    if (!isInput(f)) continue;
    const rawAll = form.getAll(f.name);
    const first = typeof rawAll[0] === 'string' ? (rawAll[0] as string).trim() : '';
    const missing = () => { if (f.required) errors[f.name] = 'This is required.'; answers[f.name] = null; };

    switch (f.type) {
      case 'text': case 'tel': case 'textarea': case 'email': case 'date': {
        if (first === '') { missing(); break; }
        const max = (f.type === 'textarea' ? f.maxLength ?? 4000 : 'maxLength' in f ? f.maxLength ?? 200 : 200);
        if (first.length > max) { errors[f.name] = `Please keep this under ${max} characters.`; break; }
        if (f.type === 'email' && !EMAIL_RE.test(first)) { errors[f.name] = 'Enter a valid email address.'; break; }
        if (f.type === 'date' && (!/^\d{4}-\d{2}-\d{2}$/.test(first) || Number.isNaN(Date.parse(first)))) { errors[f.name] = 'Enter a valid date.'; break; }
        if (f.type === 'tel' && !/^[0-9+()\-. x]{7,25}$/.test(first)) { errors[f.name] = 'Enter a valid phone number.'; break; }
        answers[f.name] = first;
        break;
      }
      case 'number': case 'scale': {
        if (first === '') { missing(); break; }
        const n = Number(first);
        if (!Number.isFinite(n)) { errors[f.name] = 'Enter a number.'; break; }
        if (f.type === 'scale' && !Number.isInteger(n)) { errors[f.name] = 'Choose one of the options.'; break; }
        if ((f.min !== undefined && n < f.min) || (f.max !== undefined && n > f.max)) {
          errors[f.name] = `Enter a value between ${f.min ?? '-∞'} and ${f.max ?? '∞'}.`; break;
        }
        answers[f.name] = n;
        break;
      }
      case 'select': case 'radio': {
        if (first === '') { missing(); break; }
        if (!f.options.some((o) => o.value === first)) { errors[f.name] = 'Choose one of the options.'; break; }
        answers[f.name] = first;
        break;
      }
      case 'checkboxes': {
        const picked = [...new Set(rawAll.filter((v): v is string => typeof v === 'string'))];
        if (picked.some((v) => !f.options.some((o) => o.value === v))) { errors[f.name] = 'Choose from the options listed.'; break; }
        if (f.max && picked.length > f.max) { errors[f.name] = `Choose at most ${f.max}.`; break; }
        if (picked.length === 0 && f.required) { errors[f.name] = 'Choose at least one.'; break; }
        answers[f.name] = picked;
        break;
      }
      case 'boolean': {
        const on = first === 'on' || first === 'true';
        if (!on && f.required) { errors[f.name] = 'Please confirm to continue.'; break; }
        answers[f.name] = on;
        break;
      }
      case 'files': {
        const list = rawAll.filter((v): v is File => typeof v !== 'string' && v.size > 0);
        if (list.length === 0) { if (f.required) errors[f.name] = 'Attach at least one file.'; files[f.name] = []; break; }
        if (list.length > f.maxFiles) { errors[f.name] = `Attach at most ${f.maxFiles} files.`; break; }
        for (const file of list) {
          if (file.size > f.maxBytes) { errors[f.name] = `"${file.name}" is larger than ${Math.round(f.maxBytes / 1048576)} MB.`; break; }
          if (!f.accept.includes(file.type)) { errors[f.name] = `"${file.name}" is not an accepted file type.`; break; }
          const head = new Uint8Array(await file.slice(0, 12).arrayBuffer());
          if (!magicBytesOk(head, file.type)) { errors[f.name] = `"${file.name}" does not look like a valid ${file.type} file.`; break; }
        }
        if (!errors[f.name]) files[f.name] = list;
        break;
      }
    }
  }
  return { ok: Object.keys(errors).length === 0, answers, files, errors };
}

/** Human-readable rendering of one answer (for review screens and CSV export). */
export function displayAnswer(f: InputField, value: AnswerValue | undefined): string {
  if (value === null || value === undefined || value === '') return '—';
  if (f.type === 'boolean') return value ? 'Yes' : 'No';
  if (f.type === 'select' || f.type === 'radio') return f.options.find((o) => o.value === value)?.label ?? String(value);
  if (f.type === 'checkboxes' && Array.isArray(value)) {
    return value.length ? value.map((v) => f.options.find((o) => o.value === v)?.label ?? v).join(', ') : '—';
  }
  return String(value);
}

export type Tally =
  | { kind: 'choices'; field: InputField; total: number; rows: { label: string; count: number }[] }
  | { kind: 'numeric'; field: InputField; total: number; average: number | null; rows: { label: string; count: number }[] }
  | { kind: 'text'; field: InputField; total: number; samples: string[] };

/** Aggregates survey responses per question for the admin results view. */
export function tally(fields: Field[], responses: Answers[]): Tally[] {
  return fields.filter(isInput).filter((f) => f.type !== 'files').map((f): Tally => {
    const values = responses.map((r) => r[f.name]).filter((v) => v !== null && v !== undefined && v !== '');
    if (f.type === 'select' || f.type === 'radio' || f.type === 'checkboxes') {
      const flat = values.flatMap((v) => (Array.isArray(v) ? v : [String(v)]));
      const answered = f.type === 'checkboxes' ? values.filter((v) => Array.isArray(v) && v.length > 0).length : values.length;
      return { kind: 'choices', field: f, total: answered, rows: f.options.map((o) => ({ label: o.label, count: flat.filter((v) => v === o.value).length })) };
    }
    if (f.type === 'boolean') {
      const all = responses.map((r) => r[f.name]);
      return { kind: 'choices', field: f, total: all.length, rows: [{ label: 'Yes', count: all.filter((v) => v === true).length }, { label: 'No', count: all.filter((v) => v !== true).length }] };
    }
    if (f.type === 'scale' || f.type === 'number') {
      const nums = values.map(Number).filter(Number.isFinite);
      const average = nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : null;
      const rows = f.type === 'scale'
        ? Array.from({ length: f.max - f.min + 1 }, (_, i) => ({ label: String(f.min + i), count: nums.filter((n) => n === f.min + i).length }))
        : [];
      return { kind: 'numeric', field: f, total: nums.length, average, rows };
    }
    return { kind: 'text', field: f, total: values.length, samples: values.map(String) };
  });
}

export function toCsv(rows: (string | number | null | undefined)[][]): string {
  const cell = (v: string | number | null | undefined) => {
    let s = v === null || v === undefined ? '' : String(v);
    if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`; // neutralise spreadsheet formula injection
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return rows.map((r) => r.map(cell).join(',')).join('\r\n') + '\r\n';
}
