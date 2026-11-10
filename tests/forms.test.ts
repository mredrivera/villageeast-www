import { describe, expect, it } from 'vitest';
import { FORMS } from '~/lib/forms/definitions';
import { checkSchema, tally, toCsv, validateForm, type Field } from '~/lib/forms/schema';

const fields: Field[] = [
  { type: 'section', label: 'About you' },
  { type: 'text', name: 'name', label: 'Name', required: true, maxLength: 10 },
  { type: 'email', name: 'email', label: 'Email' },
  { type: 'radio', name: 'color', label: 'Color', required: true, options: [{ value: 'r', label: 'Red' }, { value: 'b', label: 'Blue' }] },
  { type: 'checkboxes', name: 'sports', label: 'Sports', max: 2, options: [{ value: 'a', label: 'A' }, { value: 'b', label: 'B' }, { value: 'c', label: 'C' }] },
  { type: 'scale', name: 'rating', label: 'Rating', min: 1, max: 5 },
  { type: 'boolean', name: 'agree', label: 'Agree', required: true },
  { type: 'files', name: 'docs', label: 'Docs', accept: ['image/png', 'application/pdf'], maxFiles: 1, maxBytes: 1000 },
];
const form = (entries: [string, string | File][]) => { const f = new FormData(); for (const [k, v] of entries) f.append(k, v); return f; };
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);

describe('validateForm', () => {
  it('accepts a valid submission and normalises values', async () => {
    const r = await validateForm(fields, form([['name', '  Ann '], ['color', 'b'], ['sports', 'a'], ['sports', 'c'], ['rating', '4'], ['agree', 'on'], ['docs', new File([PNG], 'p.png', { type: 'image/png' })]]));
    expect(r.ok).toBe(true);
    expect(r.answers).toMatchObject({ name: 'Ann', email: null, color: 'b', sports: ['a', 'c'], rating: 4, agree: true });
    expect(r.files.docs).toHaveLength(1);
  });
  it('rejects missing required fields, unknown options and over-long text', async () => {
    const r = await validateForm(fields, form([['name', 'x'.repeat(11)], ['color', 'green'], ['email', 'nope'], ['rating', '9']]));
    expect(r.ok).toBe(false);
    expect(Object.keys(r.errors).sort()).toEqual(['agree', 'color', 'email', 'name', 'rating']);
  });
  it('enforces checkbox limits and ignores fields that are not in the schema', async () => {
    const r = await validateForm(fields, form([['name', 'A'], ['color', 'r'], ['agree', 'on'], ['sports', 'a'], ['sports', 'b'], ['sports', 'c'], ['role', 'admin']]));
    expect(r.errors.sports).toBeDefined();
    expect(r.answers).not.toHaveProperty('role');
  });
  it('rejects files whose content does not match the declared type, and oversized files', async () => {
    const base: [string, string][] = [['name', 'A'], ['color', 'r'], ['agree', 'on']];
    const fake = await validateForm(fields, form([...base, ['docs', new File(['<script>'], 'x.png', { type: 'image/png' })]]));
    expect(fake.errors.docs).toMatch(/does not look like/);
    const exe = await validateForm(fields, form([...base, ['docs', new File([PNG], 'x.exe', { type: 'application/x-msdownload' })]]));
    expect(exe.errors.docs).toMatch(/not an accepted/);
    const big = await validateForm(fields, form([...base, ['docs', new File([new Uint8Array(2000)], 'x.png', { type: 'image/png' })]]));
    expect(big.errors.docs).toMatch(/larger than/);
  });
});

describe('checkSchema', () => {
  it('accepts every built-in survey-safe definition shape', () => {
    expect(checkSchema(fields.filter((f) => f.type !== 'files'))).toBeNull();
  });
  it('rejects bad schemas', () => {
    expect(checkSchema([])).toMatch(/at least one/);
    expect(checkSchema([{ type: 'text', name: 'Bad Name', label: 'x' }])).toMatch(/name/);
    expect(checkSchema([{ type: 'radio', name: 'a', label: 'x', options: [] }])).toMatch(/options/);
    expect(checkSchema([{ type: 'text', name: 'a', label: 'x' }, { type: 'text', name: 'a', label: 'y' }])).toMatch(/duplicate/);
    expect(checkSchema([{ type: 'html', name: 'a', label: 'x' }])).toMatch(/unknown type/);
    expect(checkSchema(fields)).toMatch(/file uploads/);
  });
  it('built-in request forms have unique field names and a valid summary field', () => {
    for (const def of FORMS) {
      const names = def.fields.flatMap((f) => (f.type === 'section' ? [] : [f.name]));
      expect(new Set(names).size).toBe(names.length);
      expect(names).toContain(def.summaryField);
      expect(def.prefix).toMatch(/^[A-Z]{2,5}$/);
    }
  });
});

describe('tally and CSV', () => {
  it('counts choices and averages scales', () => {
    const t = tally(fields, [{ color: 'r', sports: ['a', 'b'], rating: 4, agree: true }, { color: 'r', sports: [], rating: 2, agree: false }, { color: 'b', rating: null }]);
    const color = t.find((x) => x.field.name === 'color')!;
    expect(color.kind === 'choices' && color.rows.map((r) => r.count)).toEqual([2, 1]);
    const rating = t.find((x) => x.field.name === 'rating')!;
    expect(rating.kind === 'numeric' && rating.average).toBe(3);
  });
  it('escapes CSV and neutralises spreadsheet formulas', () => {
    expect(toCsv([['a,b', 'he said "hi"', '=SUM(A1)', 5, null]])).toBe('"a,b","he said ""hi""",\'=SUM(A1),5,\r\n');
  });
});
