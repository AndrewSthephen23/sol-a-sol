import {
  FixedClock,
  LocalDate,
  Money,
  SummaryYearInFutureError,
  SummaryYearInvalidError,
} from '@sol-a-sol/domain';
import { beforeEach, describe, expect, it } from 'vitest';

import { FakeReportActualsReader, FakeReportCatalogReader } from '../ports/report-readers.fake.js';
import { GetAnnualSummary } from './annual-summary.js';

const ANA = 'user-ana';
const BRUNO = 'user-bruno';
// 3 de octubre de 2026 en Lima.
const NOW = '2026-10-03T15:00:00.000Z';

describe('GetAnnualSummary', () => {
  let actuals: FakeReportActualsReader;
  let summary: GetAnnualSummary;

  function spent(on: string, categoryId: string, amount: string, userId = ANA) {
    actuals.with({
      userId,
      date: LocalDate.parse(on),
      categoryId,
      type: 'VARIABLE_EXPENSE',
      amount: Money.of(amount, 'PEN'),
    });
  }

  beforeEach(() => {
    actuals = new FakeReportActualsReader();
    const catalog = new FakeReportCatalogReader().with(ANA, 'food').with(ANA, 'delivery', 'food');
    summary = new GetAnnualSummary(actuals, catalog, FixedClock.at(NOW));
  });

  it('puts each month in its column and adds subcategories up into their parent', async () => {
    spent('2026-01-05', 'food', '60.00');
    spent('2026-09-30', 'delivery', '40.00');

    const result = await summary.execute({ userId: ANA, year: 2026 });
    const [soles] = result.currencies;
    const variable = soles?.rows.find((row) => row.row === 'VARIABLE_EXPENSE');

    expect(variable?.months.map((month) => month?.toFixed() ?? '—')).toEqual([
      '60.00',
      '0.00',
      '0.00',
      '0.00',
      '0.00',
      '0.00',
      '0.00',
      '0.00',
      '40.00',
      '0.00',
      '—',
      '—',
    ]);
    expect(soles?.distribution.map((slice) => [slice.categoryId, slice.amount.toFixed()])).toEqual([
      ['food', '100.00'],
    ]);
  });

  it('reads only the year asked, and never another account', async () => {
    spent('2025-12-31', 'food', '99.00');
    spent('2026-03-01', 'food', '99.00', BRUNO);

    await expect(summary.execute({ userId: ANA, year: 2026 })).resolves.toEqual({
      year: 2026,
      currencies: [],
    });
  });

  it('refuses a year that has not started, and one out of range', async () => {
    await expect(summary.execute({ userId: ANA, year: 2027 })).rejects.toThrow(
      SummaryYearInFutureError,
    );
    await expect(summary.execute({ userId: ANA, year: 1999 })).rejects.toThrow(
      SummaryYearInvalidError,
    );
  });
});
