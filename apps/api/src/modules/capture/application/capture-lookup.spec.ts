import { LocalDate } from '@sol-a-sol/domain';
import { describe, expect, it } from 'vitest';

import type { NewCapture } from '../ports/capture-repository.js';
import { FakeCaptureRepository } from '../ports/capture-repository.fake.js';
import { CaptureLookup } from './capture-lookup.js';

const ANA = 'user-ana';
const BRUNO = 'user-bruno';

let keys = 0;

function capture(extra: Partial<NewCapture> = {}): NewCapture {
  keys += 1;
  return {
    source: 'IOS_SHORTCUT',
    status: 'PENDING',
    type: 'VARIABLE_EXPENSE',
    occurredAt: new Date('2026-09-15T16:30:00.000Z'),
    businessDate: LocalDate.parse('2026-09-15'),
    amount: { value: '25.90', currency: 'PEN' },
    merchant: 'Tambo',
    cardLast4: null,
    description: null,
    categoryId: null,
    paymentMethodId: null,
    warnings: [],
    rawPayload: { source: 'IOS_SHORTCUT' },
    idempotencyKey: `clave-${String(keys)}`,
    ...extra,
  };
}

describe('CaptureLookup', () => {
  it('gives the captures of the inbox in the range, with their day and amount', async () => {
    const captures = new FakeCaptureRepository();
    await captures.create(ANA, capture());
    await captures.create(
      ANA,
      capture({ status: 'DUPLICATE', amount: { value: '5.00', currency: 'USD' } }),
    );
    await captures.create(ANA, capture({ amount: { value: '9.00', currency: null } }));
    await captures.create(ANA, capture({ amount: null }));
    await captures.create(ANA, capture({ businessDate: LocalDate.parse('2026-10-01') }));
    await captures.create(BRUNO, capture());

    const found = await new CaptureLookup(captures).pendingCaptures(
      ANA,
      LocalDate.parse('2026-09-01'),
      LocalDate.parse('2026-09-30'),
    );

    expect(
      found.map(({ date, amount }) => [
        date.toString(),
        amount === null ? null : `${amount.currency} ${amount.toFixed()}`,
      ]),
    ).toEqual([
      ['2026-09-15', 'PEN 25.90'],
      ['2026-09-15', 'USD 5.00'],
      // Sin moneda o sin monto: se cuenta pero no suma.
      ['2026-09-15', null],
      ['2026-09-15', null],
    ]);
  });
});
