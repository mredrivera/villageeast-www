import { describe, expect, it } from 'vitest';
import { EXPENSE_CATEGORIES, INCOME_CATEGORIES, RESERVE, YEARS, sum } from '~/data/finance';

// Totals printed on the treasurer's reports; guards against transcription slips.
const REPORTED: Record<number, { income: number; expenses: number }> = {
  2019: { income: 100011, expenses: 80485 },
  2020: { income: 91235, expenses: 55598 }, // 75,598 less the 20,000 reserve transfer
  2021: { income: 90050, expenses: 50271 }, // 70,271 less 20,000
  2022: { income: 107420, expenses: 61858 }, // 84,538 less 22,680
  2023: { income: 97844, expenses: 67612 }, // 90,702 less 23,090
  2024: { income: 102362, expenses: 132985 },
  2025: { income: 103028, expenses: 75098 },
};

describe('finance data', () => {
  it.each(YEARS.map((y) => [y.year, y] as const))('%i matches the published totals', (year, y) => {
    expect(Math.abs(sum(y.income) - REPORTED[year]!.income)).toBeLessThanOrEqual(3);
    expect(Math.abs(sum(y.expenses) - REPORTED[year]!.expenses)).toBeLessThanOrEqual(3);
  });
  it('uses only known categories and consecutive years', () => {
    for (const y of YEARS) {
      for (const l of y.expenses) expect(EXPENSE_CATEGORIES).toContain(l.category);
      for (const l of y.income) expect(INCOME_CATEGORIES).toContain(l.category);
    }
    expect(YEARS.map((y) => y.year)).toEqual([2019, 2020, 2021, 2022, 2023, 2024, 2025]);
    expect(RESERVE.map((r) => r.year)).toEqual([...Array(11)].map((_, i) => 2019 + i));
  });
});
