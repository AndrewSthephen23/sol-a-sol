import { describe, expect, it } from 'vitest';

import { type Filters, readFilters, toListQuery, writeFilters } from './filters';

const MONTH = '2026-09';
const CATEGORY = '0b6a1f7e-2c3d-4e5f-8a9b-0c1d2e3f4a5b';
const VISA = '1c7b2f8e-3d4e-4f60-9b0c-1d2e3f4a5b6c';

function read(query: string): Filters {
  return readFilters(new URLSearchParams(query), MONTH);
}

describe('readFilters', () => {
  it('shows everything of the current month by default', () => {
    expect(read('')).toEqual({
      month: MONTH,
      show: 'ALL',
      categoryId: null,
      paymentMethodId: null,
      tag: null,
      q: null,
    });
  });

  it('reads every filter from the URL', () => {
    expect(
      read(
        `month=2026-08&show=VARIABLE_EXPENSE&categoryId=${CATEGORY}&paymentMethodId=${VISA}&tag=viaje&q=%20pan%20`,
      ),
    ).toEqual({
      month: '2026-08',
      show: 'VARIABLE_EXPENSE',
      categoryId: CATEGORY,
      paymentMethodId: VISA,
      tag: 'viaje',
      q: 'pan',
    });
  });

  it.each([
    ['a month that does not exist', 'month=2026-13', { month: MONTH }],
    ['an unknown type', 'show=GIFTS', { show: 'ALL' }],
    ['a category that is not an id', 'categoryId=food', { categoryId: null }],
    ['a payment method that is not an id', 'paymentMethodId=visa', { paymentMethodId: null }],
    ['a blank search', 'q=%20%20', { q: null }],
  ])('ignores %s', (_case, query, expected) => {
    expect(read(query)).toMatchObject(expected);
  });

  it('drops category and tag when showing transfers, which have neither', () => {
    expect(read(`show=TRANSFER&categoryId=${CATEGORY}&tag=viaje`)).toMatchObject({
      show: 'TRANSFER',
      categoryId: null,
      tag: null,
    });
  });
});

describe('writeFilters', () => {
  it('leaves out what is already the default', () => {
    expect(writeFilters(read(''), MONTH)).toBe('');
  });

  it('round-trips through the URL', () => {
    const filters = read(
      `month=2026-08&show=INCOME&categoryId=${CATEGORY}&paymentMethodId=${VISA}&tag=viaje&q=pan`,
    );

    expect(read(writeFilters(filters, MONTH))).toEqual(filters);
  });
});

describe('toListQuery', () => {
  it('asks only for the month when nothing else is filtered', () => {
    expect(toListQuery(read(''))).toEqual({ month: MONTH });
  });

  it('turns a type into type, and transfers into kind', () => {
    expect(toListQuery(read('show=DEBT'))).toEqual({ month: MONTH, type: 'DEBT' });
    expect(toListQuery(read('show=TRANSFER'))).toEqual({ month: MONTH, kind: 'transfer' });
  });

  it('keeps the payment method with transfers, which do have one', () => {
    expect(toListQuery(read(`show=TRANSFER&paymentMethodId=${VISA}`))).toEqual({
      month: MONTH,
      kind: 'transfer',
      paymentMethodId: VISA,
    });
  });

  it('passes category, tag and search along', () => {
    expect(toListQuery(read(`categoryId=${CATEGORY}&tag=viaje&q=pan`))).toEqual({
      month: MONTH,
      categoryId: CATEGORY,
      tag: 'viaje',
      q: 'pan',
    });
  });
});
