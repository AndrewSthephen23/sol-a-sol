import {
  ArchivedCategoryError,
  ArchivedPaymentMethodError,
  CategoryTypeMismatchError,
  FixedClock,
  FutureTransactionDateError,
  InvalidAmountError,
  Money,
  NonPositiveTransactionAmountError,
  TransactionCurrencyRequiredError,
} from '@sol-a-sol/domain';
import { beforeEach, describe, expect, it } from 'vitest';

import { RecordingEventPublisher } from '../../../shared/events/event-publisher.fake.js';
import {
  CategoryNotFoundError,
  PaymentMethodNotFoundError,
  TransactionNotFoundError,
} from '../domain/errors.js';
import { TRANSACTION_CREATED } from '../domain/events.js';
import { FakeCatalogReader } from '../ports/catalog-reader.fake.js';
import { FakeTransactionRepository } from '../ports/transaction-repository.fake.js';
import { type CreateTransactionInput, CreateTransaction, GetTransaction } from './transactions.js';

const ANA = 'user-ana';
const BRUNO = 'user-bruno';
const FOOD = 'category-food';
const SALARY = 'category-salary';
const NETFLIX = 'category-netflix';
const PAYROLL = 'method-payroll-pen';
const VISA = 'method-visa-bimoneda';
const OLD_CARD = 'method-old-card';
const BRUNO_FOOD = 'category-bruno-food';
const BRUNO_CARD = 'method-bruno-card';
/** Las 21:30 del 24/09/2026 en Lima: en UTC ya es el 25. */
const NOW = '2026-09-25T02:30:00.000Z';

const LUNCH: CreateTransactionInput = {
  userId: ANA,
  date: '2026-09-24',
  type: 'VARIABLE_EXPENSE',
  categoryId: FOOD,
  amount: '25.90',
  description: 'Almuerzo',
  paymentMethodId: PAYROLL,
  merchant: 'TAMBO',
  source: 'MANUAL',
};

describe('transactions', () => {
  let transactions: FakeTransactionRepository;
  let events: RecordingEventPublisher;
  let create: CreateTransaction;
  let get: GetTransaction;

  beforeEach(() => {
    transactions = new FakeTransactionRepository();
    events = new RecordingEventPublisher();
    const catalog = new FakeCatalogReader()
      .withCategory(ANA, FOOD, { type: 'VARIABLE_EXPENSE' })
      .withCategory(ANA, SALARY, { type: 'INCOME' })
      .withCategory(ANA, NETFLIX, { type: 'FIXED_EXPENSE', archived: true })
      .withCategory(BRUNO, BRUNO_FOOD, { type: 'VARIABLE_EXPENSE' })
      .withPaymentMethod(ANA, PAYROLL, { currency: 'PEN' })
      .withPaymentMethod(ANA, VISA, { currency: null })
      .withPaymentMethod(ANA, OLD_CARD, { currency: 'PEN', archived: true })
      .withPaymentMethod(BRUNO, BRUNO_CARD, { currency: 'PEN' });
    create = new CreateTransaction(transactions, catalog, events, FixedClock.at(NOW));
    get = new GetTransaction(transactions);
  });

  describe('registering one', () => {
    it('saves what was sent, with the amount as money', async () => {
      const created = await create.execute(LUNCH);

      expect(created).toMatchObject({
        type: 'VARIABLE_EXPENSE',
        categoryId: FOOD,
        description: 'Almuerzo',
        paymentMethodId: PAYROLL,
        merchant: 'TAMBO',
        source: 'MANUAL',
        captureId: null,
      });
      expect(created.date.toString()).toBe('2026-09-24');
      expect(created.amount.equals(Money.of('25.90', 'PEN'))).toBe(true);
    });

    it('keeps it for the account that registered it', async () => {
      const created = await create.execute(LUNCH);

      expect(transactions.rows).toEqual([expect.objectContaining({ id: created.id, userId: ANA })]);
    });

    it('announces it exactly once, with who and which one', async () => {
      const created = await create.execute(LUNCH);

      expect(events.published).toEqual([
        { name: TRANSACTION_CREATED, payload: { userId: ANA, transactionId: created.id } },
      ]);
    });

    it('needs neither a payment method nor a merchant', async () => {
      const created = await create.execute({
        ...LUNCH,
        paymentMethodId: null,
        merchant: null,
        currency: 'USD',
      });

      expect(created).toMatchObject({ paymentMethodId: null, merchant: null });
      expect(created.amount.currency).toBe('USD');
    });

    describe('the currency', () => {
      it('is the one of the payment method when none is sent', async () => {
        const created = await create.execute(LUNCH);

        expect(created.amount.currency).toBe('PEN');
      });

      it('is the one sent, even if the payment method has another', async () => {
        const created = await create.execute({ ...LUNCH, currency: 'USD' });

        expect(created.amount.currency).toBe('USD');
      });

      it('is required with a dual-currency card', async () => {
        await expect(create.execute({ ...LUNCH, paymentMethodId: VISA })).rejects.toThrow(
          TransactionCurrencyRequiredError,
        );
      });

      it('is required without a payment method', async () => {
        await expect(create.execute({ ...LUNCH, paymentMethodId: null })).rejects.toThrow(
          TransactionCurrencyRequiredError,
        );
      });
    });

    // Lo de hoy vale aunque en UTC ya sea mañana: el "hoy" es el de Lima.
    it('accepts today in Lima although it is already tomorrow in UTC', async () => {
      await expect(create.execute({ ...LUNCH, date: '2026-09-24' })).resolves.toBeDefined();
    });

    it('rejects a date after today in Lima', async () => {
      await expect(create.execute({ ...LUNCH, date: '2026-09-25' })).rejects.toThrow(
        FutureTransactionDateError,
      );
    });

    it.each(['0', '-25.90'])('rejects the amount %s: the type gives the sign', async (amount) => {
      await expect(create.execute({ ...LUNCH, amount })).rejects.toThrow(
        NonPositiveTransactionAmountError,
      );
    });

    it('rejects a third decimal instead of rounding it', async () => {
      await expect(create.execute({ ...LUNCH, amount: '25.905' })).rejects.toThrow(
        InvalidAmountError,
      );
    });

    it('rejects a category of another type', async () => {
      await expect(create.execute({ ...LUNCH, categoryId: SALARY })).rejects.toThrow(
        CategoryTypeMismatchError,
      );
    });

    it('rejects an archived category', async () => {
      await expect(
        create.execute({ ...LUNCH, type: 'FIXED_EXPENSE', categoryId: NETFLIX }),
      ).rejects.toThrow(ArchivedCategoryError);
    });

    it('rejects an archived payment method', async () => {
      await expect(create.execute({ ...LUNCH, paymentMethodId: OLD_CARD })).rejects.toThrow(
        ArchivedPaymentMethodError,
      );
    });

    it.each([
      ['category', { categoryId: BRUNO_FOOD }, CategoryNotFoundError],
      ['payment method', { paymentMethodId: BRUNO_CARD }, PaymentMethodNotFoundError],
      ['category', { categoryId: 'category-missing' }, CategoryNotFoundError],
      ['payment method', { paymentMethodId: 'method-missing' }, PaymentMethodNotFoundError],
    ])('does not find a %s that is missing or of another account', async (_, change, error) => {
      await expect(create.execute({ ...LUNCH, ...change })).rejects.toThrow(error);
    });

    it('saves and announces nothing when a rule breaks', async () => {
      await expect(create.execute({ ...LUNCH, amount: '0' })).rejects.toThrow();

      expect(transactions.rows).toEqual([]);
      expect(events.published).toEqual([]);
    });
  });

  describe('reading one', () => {
    it('returns an own transaction', async () => {
      const created = await create.execute(LUNCH);

      await expect(get.execute({ userId: ANA, id: created.id })).resolves.toEqual(created);
    });

    it('does not find the transaction of another account', async () => {
      const created = await create.execute(LUNCH);

      await expect(get.execute({ userId: BRUNO, id: created.id })).rejects.toThrow(
        TransactionNotFoundError,
      );
    });

    it('does not find a deleted transaction', async () => {
      const created = await create.execute(LUNCH);
      for (const row of transactions.rows) row.deletedAt = new Date(NOW);

      await expect(get.execute({ userId: ANA, id: created.id })).rejects.toThrow(
        TransactionNotFoundError,
      );
    });
  });
});
