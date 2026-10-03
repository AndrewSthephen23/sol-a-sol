import { describe, expect, it } from 'vitest';

import { monthlyReportQuerySchema, monthlySummaryExportQuerySchema } from './monthly.js';

describe('monthlyReportQuerySchema', () => {
  it('reads the year and the month as numbers', () => {
    expect(monthlyReportQuerySchema.parse({ year: '2026', month: '09' })).toEqual({
      year: 2026,
      month: 9,
    });
  });

  it.each([
    ['no month', { year: '2026' }],
    ['a two-digit year', { year: '26', month: '9' }],
    ['a month that is not a number', { year: '2026', month: 'sep' }],
  ])('rejects %s', (_case, query) => {
    expect(monthlyReportQuerySchema.safeParse(query).success).toBe(false);
  });
});

describe('monthlySummaryExportQuerySchema', () => {
  it('accepts a month in CSV', () => {
    expect(
      monthlySummaryExportQuerySchema.parse({ year: '2026', month: '9', format: 'csv' }),
    ).toEqual({ year: 2026, month: 9, format: 'csv' });
  });

  it.each([
    ['a PDF, which comes later', { year: '2026', month: '9', format: 'pdf' }],
    ['no format', { year: '2026', month: '9' }],
    ['the format in capitals', { year: '2026', month: '9', format: 'CSV' }],
  ])('rejects %s', (_label, query) => {
    expect(monthlySummaryExportQuerySchema.safeParse(query).success).toBe(false);
  });
});
