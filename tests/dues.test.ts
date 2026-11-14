import { describe, expect, it } from 'vitest';
import { addressSortKey, duesState, isIsoDate, parseAmount, samplePayment, todayEastern } from '~/lib/dues';

describe('dues status', () => {
  it('is paid whenever a payment date is recorded, even a late one', () => {
    expect(duesState('2026-06-01', '2026-03-01', '2026-11-14')).toBe('paid');
  });
  it('is due through the due date and past due the day after', () => {
    expect(duesState(null, '2026-03-01', '2026-02-28')).toBe('due');
    expect(duesState(null, '2026-03-01', '2026-03-01')).toBe('due');
    expect(duesState(null, '2026-03-01', '2026-03-02')).toBe('overdue');
  });
  it('uses the Eastern calendar date, not UTC', () => {
    expect(todayEastern(new Date('2026-03-02T03:30:00Z'))).toBe('2026-03-01');
    expect(todayEastern(new Date('2026-03-02T05:30:00Z'))).toBe('2026-03-02');
  });
});

describe('dues input parsing', () => {
  it('accepts plain dollar amounts and rejects anything else', () => {
    expect(parseAmount('550')).toBe(550);
    expect(parseAmount('$1,250.50')).toBe(1250.5);
    expect(parseAmount('-5')).toBeNull();
    expect(parseAmount('5.555')).toBeNull();
    expect(parseAmount('1e3')).toBeNull();
    expect(parseAmount('')).toBeNull();
  });
  it('rejects impossible dates', () => {
    expect(isIsoDate('2026-02-28')).toBe(true);
    expect(isIsoDate('2026-02-30')).toBe(false);
    expect(isIsoDate('03/01/2026')).toBe(false);
  });
  it('sorts properties by street, then house number', () => {
    const keys = ['20 CAMELOT DR', '105 CAMELOT DR', '9 AVALON CT'].map((a) => addressSortKey(a, '2', 'Lot 1')).sort();
    expect(keys.map((k) => k.split(' ').slice(1, 3).join(' '))).toEqual(['AVALON CT', 'CAMELOT DR', 'CAMELOT DR']);
    expect(addressSortKey('20 CAMELOT DR', '2', 'x') < addressSortKey('105 CAMELOT DR', '2', 'x')).toBe(true);
    expect(addressSortKey(null, '2', 'Lot 4') > addressSortKey('999 Z ST', '1', 'x')).toBe(true);
  });
});

describe('sample payments', () => {
  it('never dates a payment in the future and only gives checks a number', () => {
    let seed = 7;
    const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const rows = Array.from({ length: 400 }, () => samplePayment(2026, '2026-03-01', '2026-02-10', rand));
    const paid = rows.filter((r) => r !== null);
    expect(paid.length).toBeGreaterThan(280);
    expect(paid.length).toBeLessThan(400);
    for (const p of paid) {
      expect(p!.paid_on <= '2026-02-10').toBe(true);
      expect(p!.reference !== null).toBe(p!.method === 'check');
    }
  });
});
