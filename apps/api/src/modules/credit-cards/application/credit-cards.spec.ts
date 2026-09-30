import {
  CreditCardCurrencyNotAcceptedError,
  CreditCardMethodArchivedError,
  type CreditCardSettings,
  FixedClock,
  FutureOpeningBalanceError,
  InvalidStatementDayError,
  LocalDate,
  Money,
  NotACreditCardError,
} from '@sol-a-sol/domain';
import { beforeEach, describe, expect, it } from 'vitest';

import {
  CreditCardAlreadyConfiguredError,
  CreditCardNotFoundError,
  CreditCardPaymentMethodNotFoundError,
} from '../domain/errors.js';
import { FakeCreditCardCatalogReader } from '../ports/catalog-reader.fake.js';
import { FakeCreditCardRepository } from '../ports/credit-card-repository.fake.js';
import {
  ConfigureCreditCard,
  type CreditCardView,
  ListCreditCards,
  UpdateCreditCard,
} from './credit-cards.js';

const ANA = 'user-ana';
const BRUNO = 'user-bruno';
const VISA = 'method-visa';
const AMEX_PEN = 'method-amex-pen';
const SAVINGS = 'method-savings';
const OLD_CARD = 'method-old-card';
const BRUNO_VISA = 'method-bruno-visa';
// 2026-09-29 a mediodía en Lima.
const NOW = new Date('2026-09-29T17:00:00.000Z');

function settings(extra: Partial<CreditCardSettings> = {}): CreditCardSettings {
  return {
    creditLimit: Money.of('5000.00', 'PEN'),
    statementDay: 20,
    paymentDueRule: { kind: 'DAYS_AFTER_STATEMENT', days: 25 },
    openingBalance: null,
    ...extra,
  };
}

/** Lo que importa de una vista, como texto: sin depender de cómo guarda `Money` sus decimales. */
function summary({ card, paymentMethod }: CreditCardView) {
  return {
    method: paymentMethod.id,
    archived: paymentMethod.archived,
    creditLimit: `${card.creditLimit.currency} ${card.creditLimit.toFixed()}`,
    statementDay: card.statementDay,
    paymentDueRule: card.paymentDueRule,
    openingBalance:
      card.openingBalance === null
        ? null
        : {
            date: card.openingBalance.date.toString(),
            amounts: card.openingBalance.amounts.map((a) => `${a.currency} ${a.toFixed()}`),
          },
  };
}

describe('credit cards', () => {
  let cards: FakeCreditCardRepository;
  let catalog: FakeCreditCardCatalogReader;
  let list: ListCreditCards;
  let configure: ConfigureCreditCard;
  let update: UpdateCreditCard;

  beforeEach(() => {
    cards = new FakeCreditCardRepository();
    catalog = new FakeCreditCardCatalogReader()
      .withMethod(ANA, VISA)
      .withMethod(ANA, AMEX_PEN, { currency: 'PEN' })
      .withMethod(ANA, SAVINGS, { kind: 'ACCOUNT', currency: 'PEN' })
      .withMethod(ANA, OLD_CARD, { archived: true })
      .withMethod(BRUNO, BRUNO_VISA);
    const clock = FixedClock.at(NOW);
    list = new ListCreditCards(cards, catalog);
    configure = new ConfigureCreditCard(cards, catalog, clock);
    update = new UpdateCreditCard(cards, catalog, clock);
  });

  describe('ConfigureCreditCard', () => {
    it('sets up a credit card and shows it with what identifies it', async () => {
      const view = await configure.execute(ANA, VISA, settings());

      expect(view.paymentMethod).toMatchObject({
        id: VISA,
        alias: 'Tarjeta method-visa',
        last4: '1234',
      });
      expect(summary(view)).toEqual({
        method: VISA,
        archived: false,
        creditLimit: 'PEN 5000.00',
        statementDay: 20,
        paymentDueRule: { kind: 'DAYS_AFTER_STATEMENT', days: 25 },
        openingBalance: null,
      });
    });

    it('keeps an opening balance per currency, dated today in Lima', async () => {
      const balance = {
        date: LocalDate.parse('2026-09-29'),
        amounts: [Money.of('1200.50', 'PEN'), Money.of('80.00', 'USD')],
      };

      const view = await configure.execute(ANA, VISA, settings({ openingBalance: balance }));

      expect(summary(view).openingBalance).toEqual({
        date: '2026-09-29',
        amounts: ['PEN 1200.50', 'USD 80.00'],
      });
    });

    it('refuses an opening balance dated tomorrow in Lima', async () => {
      const balance = { date: LocalDate.parse('2026-09-30'), amounts: [Money.of('1.00', 'PEN')] };

      await expect(
        configure.execute(ANA, VISA, settings({ openingBalance: balance })),
      ).rejects.toThrow(FutureOpeningBalanceError);
      await expect(list.execute(ANA)).resolves.toEqual([]);
    });

    it('refuses a payment method that is not a credit card', async () => {
      await expect(configure.execute(ANA, SAVINGS, settings())).rejects.toThrow(
        NotACreditCardError,
      );
    });

    it('refuses an archived card', async () => {
      await expect(configure.execute(ANA, OLD_CARD, settings())).rejects.toThrow(
        CreditCardMethodArchivedError,
      );
    });

    it('refuses a line in a currency the card does not accept', async () => {
      await expect(
        configure.execute(ANA, AMEX_PEN, settings({ creditLimit: Money.of('900.00', 'USD') })),
      ).rejects.toThrow(CreditCardCurrencyNotAcceptedError);
    });

    it('refuses to set up the same card twice', async () => {
      await configure.execute(ANA, VISA, settings());

      await expect(configure.execute(ANA, VISA, settings({ statementDay: 5 }))).rejects.toThrow(
        CreditCardAlreadyConfiguredError,
      );
    });

    it.each([
      ['a payment method that does not exist', 'method-none'],
      ['the payment method of another account', BRUNO_VISA],
    ])('answers not found for %s', async (_case, method) => {
      await expect(configure.execute(ANA, method, settings())).rejects.toThrow(
        CreditCardPaymentMethodNotFoundError,
      );
      await expect(list.execute(BRUNO)).resolves.toEqual([]);
    });
  });

  describe('ListCreditCards', () => {
    it('lists only the cards of the account, in the order they were set up', async () => {
      await configure.execute(ANA, VISA, settings());
      await configure.execute(ANA, AMEX_PEN, settings({ statementDay: 5 }));
      await configure.execute(BRUNO, BRUNO_VISA, settings());

      const views = await list.execute(ANA);

      expect(views.map((view) => view.paymentMethod.id)).toEqual([VISA, AMEX_PEN]);
    });

    it('keeps showing a card whose payment method was archived, marked as archived', async () => {
      await configure.execute(ANA, VISA, settings());
      catalog.withMethod(ANA, VISA, { archived: true });

      const [view] = await list.execute(ANA);

      expect(view?.paymentMethod.archived).toBe(true);
    });
  });

  describe('UpdateCreditCard', () => {
    let id: string;

    beforeEach(async () => {
      id = (await configure.execute(ANA, VISA, settings())).card.id;
    });

    it('changes only what it is told, and recalculates with the new statement day', async () => {
      const view = await update.execute(ANA, id, { statementDay: 5 });

      expect(summary(view)).toMatchObject({ creditLimit: 'PEN 5000.00', statementDay: 5 });
    });

    it('changes the line, the rule and the opening balance', async () => {
      const balance = { date: LocalDate.parse('2026-09-01'), amounts: [Money.of('10.00', 'USD')] };

      const view = await update.execute(ANA, id, {
        creditLimit: Money.of('0.00', 'PEN'),
        paymentDueRule: { kind: 'DAY_OF_MONTH', day: 5 },
        openingBalance: balance,
      });

      expect(summary(view)).toMatchObject({
        creditLimit: 'PEN 0.00',
        paymentDueRule: { kind: 'DAY_OF_MONTH', day: 5 },
        openingBalance: { date: '2026-09-01', amounts: ['USD 10.00'] },
      });
    });

    it('removes the opening balance with null, and keeps it without the key', async () => {
      const balance = { date: LocalDate.parse('2026-09-01'), amounts: [Money.of('10.00', 'PEN')] };
      await update.execute(ANA, id, { openingBalance: balance });

      const kept = await update.execute(ANA, id, { statementDay: 10 });
      const removed = await update.execute(ANA, id, { openingBalance: null });

      expect(summary(kept).openingBalance).not.toBeNull();
      expect(summary(removed).openingBalance).toBeNull();
    });

    it('can still correct a card whose payment method was archived', async () => {
      catalog.withMethod(ANA, VISA, { archived: true });

      const view = await update.execute(ANA, id, { statementDay: 28 });

      expect(summary(view)).toMatchObject({ archived: true, statementDay: 28 });
    });

    it('checks the card as it would be, and saves nothing when a rule breaks', async () => {
      await expect(update.execute(ANA, id, { statementDay: 0 })).rejects.toThrow(
        InvalidStatementDayError,
      );
      const [view] = await list.execute(ANA);

      expect(view?.card.statementDay).toBe(20);
    });

    it('checks against the currency the payment method has today', async () => {
      catalog.withMethod(ANA, VISA, { currency: 'USD' });

      await expect(update.execute(ANA, id, { statementDay: 10 })).rejects.toThrow(
        CreditCardCurrencyNotAcceptedError,
      );
    });

    it.each([
      ['a card that does not exist', ANA, 'card-none'],
      ['a card of another account', BRUNO, null],
    ])('answers not found for %s', async (_case, user, cardId) => {
      await expect(update.execute(user, cardId ?? id, { statementDay: 5 })).rejects.toThrow(
        CreditCardNotFoundError,
      );
    });
  });
});
