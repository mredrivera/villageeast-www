import { describe, expect, it } from 'vitest';
import { isAdmin, isMember, isStaff, safeNext, type Profile } from '~/lib/auth';
import { escapeHtml, withFlash } from '~/lib/format';

const p = (over: Partial<Profile>): Profile => ({ id: '1', email: 'a@b.co', full_name: '', phone: null, lot_id: null, role: 'resident', status: 'approved', directory_opt_in: false, directory_show_email: false, directory_show_phone: false, ...over });

describe('role helpers', () => {
  it('requires an approved profile for every level of access', () => {
    expect(isMember(null)).toBe(false);
    expect(isMember(p({ status: 'pending' }))).toBe(false);
    expect(isAdmin(p({ role: 'admin', status: 'suspended' }))).toBe(false);
    expect(isStaff(p({ role: 'board' }))).toBe(true);
    expect(isAdmin(p({ role: 'board' }))).toBe(false);
    expect(isAdmin(p({ role: 'admin' }))).toBe(true);
  });
});

describe('safeNext', () => {
  it('only allows same-site paths', () => {
    expect(safeNext('/members/votes?x=1')).toBe('/members/votes?x=1');
    for (const bad of ['https://evil.example', '//evil.example', '/\\evil.example', 'javascript:alert(1)', '', null, '/a\nb']) expect(safeNext(bad)).toBe('/members');
  });
});

describe('format helpers', () => {
  it('escapes HTML and builds flash URLs', () => {
    expect(escapeHtml(`<a href="x">'&`)).toBe('&lt;a href=&quot;x&quot;&gt;&#39;&amp;');
    expect(withFlash('/admin/members', 'ok', 'Saved & done')).toBe('/admin/members?ok=Saved+%26+done');
  });
});
