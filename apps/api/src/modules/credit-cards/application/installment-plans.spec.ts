import {
  type CreditCardSettings,
  FixedClock,
  InstallmentPurchaseNotAChargeError,
  InstallmentPurchaseNotOnCardError,
  InstallmentTooSmallError,
  InstallmentTotalBelowPriceError,
  InvalidAmountError,
  InvalidInstallmentCountError,
  LocalDate,
  Money,
} from '@sol-a-sol/domain';
import { beforeEach, describe, expect, it } from 'vitest';

import {
  CreditCardNotFoundError,
  InstallmentPlanAlreadyExistsError,
  InstallmentPlanNotFoundError,
  InstallmentPurchaseNotFoundError,
} from '../domain/errors.js';
import { FakeCreditCardCatalogReader } from '../ports/catalog-reader.fake.js';
import { FakeCreditCardRepository } from '../ports/credit-card-repository.fake.js';
import { FakeInstallmentPlanRepository } from '../ports/installment-plan-repository.fake.js';
import { type CardPurchase } from '../ports/movements-reader.js';
import { FakeCreditCardMovementsReader } from '../ports/movements-reader.fake.js';
import { GetCreditCardStatuses } from './credit-card-status.js';
import { ListCreditCards } from './credit-cards.js';
import {
  CreateInstallmentPlan,
  DeleteInstallmentPlan,
  type InstallmentPlanView,
  ListInstallmentPlans,
} from './installment-plans.js';

const ANA = 'user-ana';
const BRUNO = 'user-bruno';
const VISA = 'method-visa';
const AMEX = 'method-amex';
const BRUNO_VISA = 'method-bruno-visa';
// 2026-09-29 en Lima. Corte 20: ciclo en curso del 21/09 al 20/10.
const NOW = new Date('2026-09-29T17:00:00.000Z');

const SETTINGS: CreditCardSettings = {
  creditLimit: Money.of('5000.00', 'PEN'),
  statementDay: 20,
  paymentDueRule: { kind: 'DAYS_AFTER_STATEMENT', days: 25 },
  openingBalance: null,
};

function purchase(id: string, extra: Partial<CardPurchase> = {}): CardPurchase {
  return {
    id,
    date: LocalDate.parse('2026-09-10'),
    type: 'VARIABLE_EXPENSE',
    amount: Money.of('1200.00', 'PEN'),
    paymentMethodId: VISA,
    description: 'Televisor',
    ...extra,
  };
}

/** Lo que importa de un plan, como texto. */
function plain(view: InstallmentPlanView) {
  return {
    state: view.state,
    total: view.total?.toFixed() ?? null,
    interest: view.interest?.toFixed() ?? null,
    installments: view.installments.map(
      (item) => `${String(item.number)}:${item.amount.toFixed()}@${item.statementDate.toString()}`,
    ),
    pending: view.pending.map((item) => item.number),
  };
}

describe('installment plans', () => {
  let cards: FakeCreditCardRepository;
  let plans: FakeInstallmentPlanRepository;
  let movements: FakeCreditCardMovementsReader;
  let list: ListInstallmentPlans;
  let create: CreateInstallmentPlan;
  let remove: DeleteInstallmentPlan;
  let statuses: GetCreditCardStatuses;
  let visa: string;
  let brunoVisa: string;

  beforeEach(async () => {
    cards = new FakeCreditCardRepository();
    plans = new FakeInstallmentPlanRepository();
    movements = new FakeCreditCardMovementsReader()
      .withPurchase(ANA, purchase('tv'))
      .withPurchase(ANA, purchase('with-amex', { paymentMethodId: AMEX }))
      .withPurchase(ANA, purchase('refund', { type: 'INCOME' }))
      .withPurchase(ANA, purchase('gone'), true)
      .withPurchase(BRUNO, purchase('bruno-tv', { paymentMethodId: BRUNO_VISA }));
    const clock = FixedClock.at(NOW);
    const catalog = new FakeCreditCardCatalogReader()
      .withMethod(ANA, VISA)
      .withMethod(ANA, AMEX)
      .withMethod(BRUNO, BRUNO_VISA);
    list = new ListInstallmentPlans(cards, plans, movements, clock);
    create = new CreateInstallmentPlan(cards, plans, movements, clock);
    remove = new DeleteInstallmentPlan(plans);
    statuses = new GetCreditCardStatuses(
      new ListCreditCards(cards, catalog),
      movements,
      plans,
      clock,
    );
    visa = (await cards.create(ANA, VISA, SETTINGS)).id;
    brunoVisa = (await cards.create(BRUNO, BRUNO_VISA, SETTINGS)).id;
  });

  describe('CreateInstallmentPlan', () => {
    it('splits a purchase in 3 without losing a cent, one statement each', async () => {
      movements.change('tv', { amount: Money.of('100.00', 'PEN') });

      const view = await create.execute(ANA, visa, {
        transactionId: 'tv',
        count: 3,
        totalAmount: null,
      });

      expect(plain(view)).toEqual({
        state: 'ACTIVE',
        total: '100.00',
        interest: '0.00',
        installments: ['1:33.34@2026-09-20', '2:33.33@2026-10-20', '3:33.33@2026-11-20'],
        pending: [2, 3],
      });
    });

    it('splits the bank total in 12 when there is interest', async () => {
      const view = await create.execute(ANA, visa, {
        transactionId: 'tv',
        count: 12,
        totalAmount: '1302.36',
      });

      expect(plain(view)).toMatchObject({ total: '1302.36', interest: '102.36' });
      expect(view.installments).toHaveLength(12);
      expect(
        view.installments.reduce((sum, item) => sum.add(item.amount), Money.zero('PEN')).toFixed(),
      ).toBe('1302.36');
      expect(view.installments[11]?.statementDate.toString()).toBe('2027-08-20');
    });

    it.each([
      ['a purchase with another card', 'with-amex', InstallmentPurchaseNotOnCardError],
      ['an income', 'refund', InstallmentPurchaseNotAChargeError],
      ['a deleted purchase', 'gone', InstallmentPurchaseNotFoundError],
      ['a purchase of another account', 'bruno-tv', InstallmentPurchaseNotFoundError],
      ['a purchase that does not exist', 'none', InstallmentPurchaseNotFoundError],
    ])('refuses %s', async (_case, transactionId, error) => {
      await expect(
        create.execute(ANA, visa, { transactionId, count: 3, totalAmount: null }),
      ).rejects.toThrow(error);
      await expect(list.execute(ANA, visa)).resolves.toEqual([]);
    });

    it.each([
      ['1 installment', 1, null, InvalidInstallmentCountError],
      ['37 installments', 37, null, InvalidInstallmentCountError],
      ['a bank total below the price', 3, '1199.99', InstallmentTotalBelowPriceError],
      ['a bank total with three decimals', 3, '1300.001', InvalidAmountError],
    ])('refuses %s', async (_case, count, totalAmount, error) => {
      await expect(
        create.execute(ANA, visa, { transactionId: 'tv', count, totalAmount }),
      ).rejects.toThrow(error);
    });

    it('refuses a purchase too small for the installments', async () => {
      movements.change('tv', { amount: Money.of('0.02', 'PEN') });

      await expect(
        create.execute(ANA, visa, { transactionId: 'tv', count: 3, totalAmount: null }),
      ).rejects.toThrow(InstallmentTooSmallError);
    });

    it('refuses a second plan for the same purchase', async () => {
      await create.execute(ANA, visa, { transactionId: 'tv', count: 3, totalAmount: null });

      await expect(
        create.execute(ANA, visa, { transactionId: 'tv', count: 6, totalAmount: null }),
      ).rejects.toThrow(InstallmentPlanAlreadyExistsError);
    });

    it('answers not found for the card of another account', async () => {
      await expect(
        create.execute(ANA, brunoVisa, { transactionId: 'bruno-tv', count: 3, totalAmount: null }),
      ).rejects.toThrow(CreditCardNotFoundError);
    });
  });

  describe('the plan follows the purchase', () => {
    let id: string;

    beforeEach(async () => {
      id = (await create.execute(ANA, visa, { transactionId: 'tv', count: 3, totalAmount: null }))
        .plan.id;
    });

    it('takes the corrected amount when there is no interest', async () => {
      movements.change('tv', { amount: Money.of('900.00', 'PEN') });

      const [view] = await list.execute(ANA, visa);

      expect(view && plain(view)).toMatchObject({ state: 'ACTIVE', total: '900.00' });
    });

    it('is ignored while the purchase is deleted, and comes back when it is restored', async () => {
      movements.change('tv', { deleted: true });
      const [deleted] = await list.execute(ANA, visa);
      movements.change('tv', { deleted: false });
      const [restored] = await list.execute(ANA, visa);

      expect(deleted && plain(deleted)).toEqual({
        state: 'PURCHASE_DELETED',
        total: null,
        interest: null,
        installments: [],
        pending: [],
      });
      expect(deleted?.plan.id).toBe(id);
      expect(restored?.state).toBe('ACTIVE');
    });

    it('is not valid once the purchase moves to another card', async () => {
      movements.change('tv', { paymentMethodId: AMEX });

      const [view] = await list.execute(ANA, visa);

      expect(view && plain(view)).toMatchObject({
        state: 'PURCHASE_NOT_ON_CARD',
        installments: [],
      });
    });

    it('changes the statement of the card, and stops when the plan is undone', async () => {
      const before = (await statuses.one(ANA, visa)).status;
      await remove.execute(ANA, visa, id);
      const after = (await statuses.one(ANA, visa)).status;

      // Ningún movimiento en el fake: solo cuenta lo que el plan cambia. Con el plan, el estado
      // del 20/09 lleva la primera cuota y quedan dos pendientes.
      expect(before.currencies[0]?.pendingInstallments.toFixed()).toBe('800.00');
      expect(before.statement?.balances[0]?.balance.toFixed()).toBe('-800.00');
      expect(after.currencies[0]?.pendingInstallments.toFixed()).toBe('0.00');
    });
  });

  describe('ListInstallmentPlans', () => {
    it('answers not found for the card of another account', async () => {
      await expect(list.execute(BRUNO, visa)).rejects.toThrow(CreditCardNotFoundError);
    });
  });

  describe('DeleteInstallmentPlan', () => {
    it('answers not found for a plan of another card or another account', async () => {
      const { plan } = await create.execute(ANA, visa, {
        transactionId: 'tv',
        count: 3,
        totalAmount: null,
      });

      await expect(remove.execute(BRUNO, visa, plan.id)).rejects.toThrow(
        InstallmentPlanNotFoundError,
      );
      await expect(remove.execute(ANA, brunoVisa, plan.id)).rejects.toThrow(
        InstallmentPlanNotFoundError,
      );
      await expect(list.execute(ANA, visa)).resolves.toHaveLength(1);
    });
  });
});
