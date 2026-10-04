import { describe, expect, it } from 'vitest';

import { Money } from '../money/money.js';
import { LocalDate } from '../time/local-date.js';
import {
  type CapturedMovement,
  type DuplicateProbe,
  findDuplicate,
  type RecordedMovement,
} from './capture-duplicates.js';

const AT = new Date('2026-10-03T15:00:00.000Z');
const OCT_3 = LocalDate.of(2026, 10, 3);

const probe: DuplicateProbe = {
  amount: { value: '25.90', currency: 'PEN' },
  merchant: 'Tambo',
  occurredAt: AT,
  date: OCT_3,
};

function capture(extra: Partial<CapturedMovement> = {}): CapturedMovement {
  return {
    id: 'otra-captura',
    amount: { value: '25.90', currency: 'PEN' },
    merchant: 'TAMBÓ',
    occurredAt: AT,
    status: 'PENDING',
    ...extra,
  };
}

function transaction(extra: Partial<RecordedMovement> = {}): RecordedMovement {
  return {
    id: 'transaccion',
    amount: Money.of('25.90', 'PEN'),
    merchant: 'tambo',
    description: 'Almuerzo',
    date: OCT_3,
    ...extra,
  };
}

function secondsLater(seconds: number) {
  return new Date(AT.getTime() + seconds * 1000);
}

describe('findDuplicate (decision 6)', () => {
  it('finds another capture with the same amount and merchant, ignoring accents and case', () => {
    expect(findDuplicate(probe, [capture()], [])).toEqual({
      kind: 'CAPTURE',
      id: 'otra-captura',
    });
  });

  it.each([
    ['1:59 later', 119],
    ['2:00 later', 120],
    ['2:00 earlier', -120],
  ])('counts a capture %s', (_label, seconds) => {
    expect(
      findDuplicate(probe, [capture({ occurredAt: secondsLater(seconds) })], []),
    ).not.toBeNull();
  });

  it.each([
    ['2:01 later', 121],
    ['2:01 earlier', -121],
  ])('does not count a capture %s', (_label, seconds) => {
    expect(findDuplicate(probe, [capture({ occurredAt: secondsLater(seconds) })], [])).toBeNull();
  });

  it.each([
    ['another amount', { amount: { value: '25.91', currency: 'PEN' as const } }],
    [
      'the same amount in another currency',
      { amount: { value: '25.90', currency: 'USD' as const } },
    ],
    ['an amount without a currency', { amount: { value: '25.90', currency: null } }],
    ['no amount', { amount: null }],
    ['another merchant', { merchant: 'Wong' }],
    ['no merchant', { merchant: null }],
    ['a discarded one', { status: 'DISCARDED' as const }],
  ])('does not count a capture with %s', (_label, extra) => {
    expect(findDuplicate(probe, [capture(extra)], [])).toBeNull();
  });

  it.each(['CONFIRMED', 'DUPLICATE'] as const)('counts a %s capture', (status) => {
    expect(findDuplicate(probe, [capture({ status })], [])).not.toBeNull();
  });

  it('finds a transaction of the same day with the same amount and merchant', () => {
    expect(findDuplicate(probe, [], [transaction()])).toEqual({
      kind: 'TRANSACTION',
      id: 'transaccion',
    });
  });

  it('compares with the description of a transaction without a merchant (decided 2026-10-04)', () => {
    expect(
      findDuplicate(probe, [], [transaction({ merchant: null, description: ' Tambo ' })]),
    ).not.toBeNull();
  });

  it('does not compare with the description of a transaction that has a merchant', () => {
    expect(
      findDuplicate(probe, [], [transaction({ merchant: 'Wong', description: 'Tambo' })]),
    ).toBeNull();
  });

  it.each([
    ['another day', { date: LocalDate.of(2026, 10, 2) }],
    ['another amount', { amount: Money.of('25.91', 'PEN') }],
    ['another currency', { amount: Money.of('25.90', 'USD') }],
    ['another merchant', { merchant: 'Wong' }],
  ])('does not count a transaction of %s', (_label, extra) => {
    expect(findDuplicate(probe, [], [transaction(extra)])).toBeNull();
  });

  it('prefers another capture over a transaction', () => {
    expect(findDuplicate(probe, [capture()], [transaction()])?.kind).toBe('CAPTURE');
  });

  it.each([
    ['without a merchant', { merchant: null }],
    ['with a blank merchant', { merchant: '  ' }],
    ['without an amount', { amount: null }],
    ['without a currency', { amount: { value: '25.90', currency: null } }],
  ])('marks nothing for a capture %s (decided 2026-10-04)', (_label, extra) => {
    expect(
      findDuplicate({ ...probe, ...extra }, [capture({ merchant: '  ' })], [transaction()]),
    ).toBeNull();
  });
});
