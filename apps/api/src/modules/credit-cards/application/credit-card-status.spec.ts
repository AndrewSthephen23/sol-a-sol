import { type CreditCardSettings, FixedClock, LocalDate, Money } from '@sol-a-sol/domain';
import { beforeEach, describe, expect, it } from 'vitest';

import { CreditCardNotFoundError } from '../domain/errors.js';
import { FakeCreditCardCatalogReader } from '../ports/catalog-reader.fake.js';
import { FakeCreditCardRepository } from '../ports/credit-card-repository.fake.js';
import { FakeCreditCardMovementsReader } from '../ports/movements-reader.fake.js';
import { GetCreditCardStatuses } from './credit-card-status.js';
import { ListCreditCards } from './credit-cards.js';

const ANA = 'user-ana';
const BRUNO = 'user-bruno';
const VISA = 'method-visa';
const AMEX = 'method-amex';
const BRUNO_VISA = 'method-bruno-visa';
// 2026-09-29 a las 21:30 de Lima: en UTC ya es 30, pero el día de negocio sigue siendo 29.
const NOW = new Date('2026-09-30T02:30:00.000Z');

const SETTINGS: CreditCardSettings = {
  creditLimit: Money.of('1000.00', 'PEN'),
  statementDay: 20,
  paymentDueRule: { kind: 'DAYS_AFTER_STATEMENT', days: 25 },
  openingBalance: null,
};

describe('GetCreditCardStatuses', () => {
  let cards: FakeCreditCardRepository;
  let movements: FakeCreditCardMovementsReader;
  let statuses: GetCreditCardStatuses;
  let visa: string;

  function move(
    userId: string,
    paymentMethodId: string,
    date: string,
    kind: 'VARIABLE_EXPENSE' | 'TRANSFER_IN',
    amount: Money,
  ) {
    movements.with({ userId, paymentMethodId, date: LocalDate.parse(date), kind, amount });
  }

  beforeEach(async () => {
    cards = new FakeCreditCardRepository();
    const catalog = new FakeCreditCardCatalogReader()
      .withMethod(ANA, VISA)
      .withMethod(ANA, AMEX)
      .withMethod(BRUNO, BRUNO_VISA);
    movements = new FakeCreditCardMovementsReader();
    statuses = new GetCreditCardStatuses(
      new ListCreditCards(cards, catalog),
      movements,
      FixedClock.at(NOW),
    );
    visa = (await cards.create(ANA, VISA, SETTINGS)).id;
    await cards.create(ANA, AMEX, { ...SETTINGS, statementDay: 5 });
    await cards.create(BRUNO, BRUNO_VISA, SETTINGS);
  });

  it('reads what moved with the card up to today in Lima, and computes where it stands', async () => {
    move(ANA, VISA, '2026-09-20', 'VARIABLE_EXPENSE', Money.of('400.00', 'PEN'));
    move(ANA, VISA, '2026-09-29', 'VARIABLE_EXPENSE', Money.of('10.00', 'PEN'));
    // Mañana en Lima: todavía no pasó.
    move(ANA, VISA, '2026-09-30', 'VARIABLE_EXPENSE', Money.of('999.00', 'PEN'));
    move(ANA, VISA, '2026-09-25', 'TRANSFER_IN', Money.of('20.00', 'USD'));

    const { status } = await statuses.one(ANA, visa);

    expect(status.cycle.start.toString()).toBe('2026-09-21');
    expect(status.currencies.map((entry) => [entry.currency, entry.debt.toFixed()])).toEqual([
      ['PEN', '410.00'],
      ['USD', '-20.00'],
    ]);
    expect(status.statement?.balances.map((entry) => entry.remaining.toFixed())).toEqual([
      '400.00',
      '0.00',
    ]);
    expect(status.utilization.level).toBe('HIGH');
  });

  it('never adds what moved with another card or another account', async () => {
    move(ANA, AMEX, '2026-09-10', 'VARIABLE_EXPENSE', Money.of('50.00', 'PEN'));
    move(BRUNO, VISA, '2026-09-10', 'VARIABLE_EXPENSE', Money.of('50.00', 'PEN'));

    const { status } = await statuses.one(ANA, visa);

    expect(status.currencies.map((entry) => entry.debt.toFixed())).toEqual(['0.00']);
  });

  it('gives every card of the account, with its own cycle', async () => {
    const all = await statuses.all(ANA);

    expect(all.map((view) => [view.paymentMethod.id, view.status.cycle.end.toString()])).toEqual([
      [VISA, '2026-10-20'],
      [AMEX, '2026-10-05'],
    ]);
  });

  it.each([
    ['a card that does not exist', ANA, 'card-none'],
    ['a card of another account', BRUNO, null],
  ])('answers not found for %s', async (_case, user, id) => {
    await expect(statuses.one(user, id ?? visa)).rejects.toThrow(CreditCardNotFoundError);
  });
});
