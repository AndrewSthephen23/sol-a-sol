import { describe, expect, it } from 'vitest';

import type { CategoryInfo } from '@/features/transactions/labels';

import {
  categoryLink,
  chartNumber,
  dailySummary,
  NEUTRAL_COLOR,
  shareText,
  sliceColor,
  sliceName,
} from './dashboard-model';

const FOOD = '11111111-1111-4111-8111-111111111111';
const categories = new Map<string, CategoryInfo>([
  [
    FOOD,
    {
      id: FOOD,
      name: 'Comida',
      type: 'VARIABLE_EXPENSE',
      parentId: null,
      color: '#16a34a',
      icon: 'tag',
      archivedAt: null,
      createdAt: '2026-09-01T00:00:00Z',
      updatedAt: '2026-09-01T00:00:00Z',
    },
  ],
]);

const day = (date: string, amount: string) => ({ date, amount });

describe('dashboard model', () => {
  it('turns an amount into a number only to draw it', () => {
    expect(chartNumber('1234.50')).toBe(1234.5);
  });

  it.each([
    ['36.666666', '36.67 %'],
    ['12.345', '12.34 %'],
    ['100', '100.00 %'],
    [null, '—'],
  ])('shows the share %s as %s', (share, text) => {
    expect(shareText(share)).toBe(text);
  });

  it('names and colors a slice after its category, and «Otras» in grey', () => {
    const food = { categoryId: FOOD, amount: '10.00', share: '50' };
    const others = { categoryId: null, amount: '10.00', share: '50' };
    const gone = { categoryId: '99999999-9999-4999-8999-999999999999', amount: '1', share: '1' };

    expect([sliceName(food, categories), sliceColor(food, categories)]).toEqual([
      'Comida',
      '#16a34a',
    ]);
    expect([sliceName(others, categories), sliceColor(others, categories)]).toEqual([
      'Otras',
      NEUTRAL_COLOR,
    ]);
    expect([sliceName(gone, categories), sliceColor(gone, categories)]).toEqual([
      'Categoría',
      NEUTRAL_COLOR,
    ]);
  });

  it('links a category to its movements of the month', () => {
    expect(categoryLink(FOOD, '2026-08')).toBe(`/transactions?month=2026-08&categoryId=${FOOD}`);
  });

  describe('dailySummary', () => {
    it('adds up the days and names the one with the most spending, the first on a tie', () => {
      expect(
        dailySummary(
          [
            day('2026-09-01', '10.10'),
            day('2026-09-02', '0.00'),
            day('2026-09-03', '1200.00'),
            day('2026-09-04', '1200.00'),
          ],
          'PEN',
        ),
      ).toBe(
        'S/ 2,410.10 gastados en 4 días. El día de más gasto fue el jueves, 3 de setiembre, con S/ 1,200.00.',
      );
    });

    it('says so when nothing was spent', () => {
      expect(dailySummary([day('2026-09-01', '0.00')], 'USD')).toBe('Sin gastos en 1 día.');
    });

    it('says so when the month has not started', () => {
      expect(dailySummary([], 'PEN')).toBe('El mes todavía no empieza.');
    });
  });
});
