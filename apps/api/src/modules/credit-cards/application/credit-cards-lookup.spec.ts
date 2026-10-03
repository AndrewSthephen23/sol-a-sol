import { type CreditCardSettings, LocalDate, Money } from '@sol-a-sol/domain';
import { beforeEach, describe, expect, it } from 'vitest';

import { FakeCreditCardCatalogReader } from '../ports/catalog-reader.fake.js';
import { FakeCreditCardRepository } from '../ports/credit-card-repository.fake.js';
import { FakeInstallmentPlanRepository } from '../ports/installment-plan-repository.fake.js';
import { FakeCreditCardMovementsReader } from '../ports/movements-reader.fake.js';
import { CreditCardsLookup, type MonthlyCard } from './credit-cards-lookup.js';
import { ListCreditCards } from './credit-cards.js';

const ANA = 'user-ana';
const BRUNO = 'user-bruno';
const VISA = 'method-visa';
const AMEX = 'method-amex';
const BRUNO_VISA = 'method-bruno-visa';
const date = (text: string) => LocalDate.parse(text);
const pen = (amount: string) => Money.of(amount, 'PEN');

// Corte 20, pago a 25 días: el estado que cierra el 20 de setiembre vence el 15 de octubre.
const SETTINGS: CreditCardSettings = {
  creditLimit: pen('1000.00'),
  statementDay: 20,
  paymentDueRule: { kind: 'DAYS_AFTER_STATEMENT', days: 25 },
  openingBalance: null,
};

/** Lo que importa de una tarjeta en el mes, como texto. */
function plain(card: MonthlyCard | undefined) {
  return {
    charges: card?.charges.map((charge) => `${charge.currency} ${charge.toFixed()}`),
    statements: card?.statements.map((statement) => ({
      closingDate: statement.closingDate.toString(),
      dueDate: statement.dueDate.toString(),
      balances: statement.balances.map(
        (entry) => `${entry.balance.toFixed()} / ${entry.remaining.toFixed()}`,
      ),
    })),
  };
}

describe('CreditCardsLookup', () => {
  let cards: FakeCreditCardRepository;
  let movements: FakeCreditCardMovementsReader;
  let lookup: CreditCardsLookup;

  function move(
    paymentMethodId: string,
    on: string,
    kind: 'VARIABLE_EXPENSE' | 'TRANSFER_IN',
    amount: Money,
    userId = ANA,
  ) {
    movements.with({ userId, paymentMethodId, date: date(on), kind, amount });
  }

  beforeEach(async () => {
    cards = new FakeCreditCardRepository();
    const catalog = new FakeCreditCardCatalogReader()
      .withMethod(ANA, VISA)
      .withMethod(ANA, AMEX, { archived: true })
      .withMethod(BRUNO, BRUNO_VISA);
    movements = new FakeCreditCardMovementsReader();
    lookup = new CreditCardsLookup(
      new ListCreditCards(cards, catalog),
      movements,
      new FakeInstallmentPlanRepository(),
    );
    await cards.create(ANA, VISA, SETTINGS);
    await cards.create(BRUNO, BRUNO_VISA, SETTINGS);
  });

  it('gives what was charged in the month and the statement closing in it, as of the cutoff', async () => {
    move(VISA, '2026-08-25', 'VARIABLE_EXPENSE', pen('100.00'));
    move(VISA, '2026-09-10', 'VARIABLE_EXPENSE', pen('200.00'));
    move(VISA, '2026-09-22', 'VARIABLE_EXPENSE', pen('50.00'));
    move(VISA, '2026-09-25', 'TRANSFER_IN', pen('120.00'));
    // Después de la fecha de corte: no cuenta en nada.
    move(VISA, '2026-10-02', 'VARIABLE_EXPENSE', pen('999.00'));
    move(VISA, '2026-10-02', 'TRANSFER_IN', pen('180.00'));

    const [visa] = await lookup.monthlyCards(ANA, date('2026-09-01'), date('2026-09-30'));

    expect(visa?.label).toEqual({ alias: `Tarjeta ${VISA}`, institution: 'BCP', last4: '1234' });
    expect(visa?.archived).toBe(false);
    expect(plain(visa)).toEqual({
      // Las compras del mes calendario; un pago no es un cargo.
      charges: ['PEN 250.00'],
      // Se debían S/ 300.00 al 20; con el pago del 25 faltan S/ 180.00 al 30.
      statements: [
        { closingDate: '2026-09-20', dueDate: '2026-10-15', balances: ['300.00 / 180.00'] },
      ],
    });
  });

  it('has no statement yet in the month in course before the statement day', async () => {
    move(VISA, '2026-09-10', 'VARIABLE_EXPENSE', pen('200.00'));
    move(VISA, '2026-09-16', 'VARIABLE_EXPENSE', pen('999.00'));

    const [visa] = await lookup.monthlyCards(ANA, date('2026-09-01'), date('2026-09-15'));

    expect(plain(visa)).toEqual({ charges: ['PEN 200.00'], statements: [] });
  });

  it('takes a statement that closes right on the cutoff date, without later movements', async () => {
    const cardId = (await cards.list(ANA))[0]?.id ?? '';
    await cards.update(ANA, cardId, { ...SETTINGS, statementDay: 30 });
    move(VISA, '2026-09-30', 'VARIABLE_EXPENSE', pen('50.00'));
    move(VISA, '2026-10-01', 'TRANSFER_IN', pen('50.00'));

    const [visa] = await lookup.monthlyCards(ANA, date('2026-09-01'), date('2026-09-30'));

    expect(plain(visa).statements).toEqual([
      { closingDate: '2026-09-30', dueDate: '2026-10-25', balances: ['50.00 / 50.00'] },
    ]);
  });

  it('lists archived cards too, and never the cards of another account', async () => {
    await cards.create(ANA, AMEX, SETTINGS);
    move(BRUNO_VISA, '2026-09-10', 'VARIABLE_EXPENSE', pen('999.00'), BRUNO);

    const result = await lookup.monthlyCards(ANA, date('2026-09-01'), date('2026-09-30'));

    expect(result.map((card) => [card.label.alias, card.archived, card.charges])).toEqual([
      [`Tarjeta ${VISA}`, false, []],
      [`Tarjeta ${AMEX}`, true, []],
    ]);
  });
});
