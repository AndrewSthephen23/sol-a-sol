import { FixedClock, InvalidLocalDateError, LocalDate, Money } from '@sol-a-sol/domain';
import { beforeEach, describe, expect, it } from 'vitest';

import { FakeReportActualsReader, FakeReportCatalogReader } from '../ports/report-readers.fake.js';
import { GetMonthlyDashboard } from './monthly-dashboard.js';

const ANA = 'user-ana';
const BRUNO = 'user-bruno';
/** Las 21:30 del 12/09/2026 en Lima: en UTC ya es el 13. */
const NOW = '2026-09-13T02:30:00.000Z';

describe('GetMonthlyDashboard', () => {
  let actuals: FakeReportActualsReader;
  let dashboard: GetMonthlyDashboard;

  function spent(date: string, categoryId: string, amount: string, userId = ANA) {
    actuals.with({
      userId,
      date: LocalDate.parse(date),
      categoryId,
      type: 'VARIABLE_EXPENSE',
      amount: Money.of(amount, 'PEN'),
    });
  }

  beforeEach(() => {
    actuals = new FakeReportActualsReader();
    const catalog = new FakeReportCatalogReader()
      .with(ANA, 'food')
      .with(ANA, 'delivery', 'food')
      .with(ANA, 'movies');
    dashboard = new GetMonthlyDashboard(actuals, catalog, FixedClock.at(NOW));
  });

  it('adds the subcategories up into their parent, like the budget', async () => {
    spent('2026-09-01', 'food', '100');
    spent('2026-09-02', 'delivery', '50');
    spent('2026-09-02', 'movies', '30');

    const { currencies } = await dashboard.execute({ userId: ANA, year: 2026, month: 9 });

    expect(
      currencies[0]?.distribution.map((slice) => [slice.categoryId, slice.amount.toFixed()]),
    ).toEqual([
      ['food', '150.00'],
      ['movies', '30.00'],
    ]);
  });

  it('draws the current month up to today in Lima, not in UTC', async () => {
    spent('2026-09-01', 'food', '1');

    const { currencies } = await dashboard.execute({ userId: ANA, year: 2026, month: 9 });

    expect(currencies[0]?.daily.at(-1)?.date.toString()).toBe('2026-09-12');
  });

  it('reads only the month asked, and never another account', async () => {
    spent('2026-08-31', 'food', '99');
    spent('2026-10-01', 'food', '99');
    spent('2026-09-05', 'food', '99', BRUNO);

    await expect(dashboard.execute({ userId: ANA, year: 2026, month: 9 })).resolves.toEqual({
      year: 2026,
      month: 9,
      currencies: [],
    });
  });

  it('refuses a month that does not exist', async () => {
    await expect(dashboard.execute({ userId: ANA, year: 2026, month: 13 })).rejects.toThrow(
      InvalidLocalDateError,
    );
  });
});
