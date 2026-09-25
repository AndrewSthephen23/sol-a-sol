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
import {
  TRANSACTION_CREATED,
  TRANSACTION_DELETED,
  TRANSACTION_RESTORED,
  TRANSACTION_UPDATED,
} from '../domain/events.js';
import { FakeCatalogReader } from '../ports/catalog-reader.fake.js';
import { FakeTransactionRepository } from '../ports/transaction-repository.fake.js';
import {
  type CreateTransactionInput,
  CreateTransaction,
  DeleteTransaction,
  GetTransaction,
  RestoreTransaction,
  type TransactionCorrection,
  UpdateTransaction,
} from './transactions.js';

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
const SUPERMARKET = 'category-supermarket';
const RENT = 'category-rent';
const OLD_FOOD = 'category-old-food';
const USD_ACCOUNT = 'method-usd-account';
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
  let update: UpdateTransaction;
  let remove: DeleteTransaction;
  let restore: RestoreTransaction;

  beforeEach(() => {
    transactions = new FakeTransactionRepository();
    events = new RecordingEventPublisher();
    const catalog = new FakeCatalogReader()
      .withCategory(ANA, FOOD, { type: 'VARIABLE_EXPENSE' })
      .withCategory(ANA, SALARY, { type: 'INCOME' })
      .withCategory(ANA, NETFLIX, { type: 'FIXED_EXPENSE', archived: true })
      .withCategory(ANA, SUPERMARKET, { type: 'VARIABLE_EXPENSE' })
      .withCategory(ANA, RENT, { type: 'FIXED_EXPENSE' })
      .withCategory(ANA, OLD_FOOD, { type: 'VARIABLE_EXPENSE', archived: true })
      .withCategory(BRUNO, BRUNO_FOOD, { type: 'VARIABLE_EXPENSE' })
      .withPaymentMethod(ANA, PAYROLL, { currency: 'PEN' })
      .withPaymentMethod(ANA, VISA, { currency: null })
      .withPaymentMethod(ANA, OLD_CARD, { currency: 'PEN', archived: true })
      .withPaymentMethod(ANA, USD_ACCOUNT, { currency: 'USD' })
      .withPaymentMethod(BRUNO, BRUNO_CARD, { currency: 'PEN' });
    const clock = FixedClock.at(NOW);
    create = new CreateTransaction(transactions, catalog, events, clock);
    get = new GetTransaction(transactions);
    update = new UpdateTransaction(transactions, catalog, events, clock);
    remove = new DeleteTransaction(transactions, events, clock);
    restore = new RestoreTransaction(transactions, events);
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

  describe('correcting one', () => {
    /** Registra el almuerzo y olvida su evento, para mirar solo lo que anuncia la corrección. */
    async function lunch(): Promise<string> {
      const created = await create.execute(LUNCH);
      events.published.length = 0;

      return created.id;
    }

    function correct(id: string, changes: TransactionCorrection, userId = ANA) {
      return update.execute({ userId, id, changes });
    }

    it('changes only what was sent', async () => {
      const id = await lunch();

      const updated = await correct(id, { description: 'Menú', merchant: null });

      expect(updated).toMatchObject({
        description: 'Menú',
        merchant: null,
        categoryId: FOOD,
        paymentMethodId: PAYROLL,
      });
      expect(updated.amount.equals(Money.of('25.90', 'PEN'))).toBe(true);
    });

    it('announces it exactly once, with who and which one', async () => {
      const id = await lunch();

      await correct(id, { description: 'Menú' });

      expect(events.published).toEqual([
        { name: TRANSACTION_UPDATED, payload: { userId: ANA, transactionId: id } },
      ]);
    });

    // Una importada sigue diciendo que vino de un CSV aunque se corrija a mano.
    it('keeps where it came from', async () => {
      const created = await create.execute({ ...LUNCH, source: 'IMPORT' });

      await expect(correct(created.id, { amount: '30.00' })).resolves.toMatchObject({
        source: 'IMPORT',
      });
    });

    describe('the amount and currency', () => {
      it('changes the amount in the same currency', async () => {
        const updated = await correct(await lunch(), { amount: '30.10' });

        expect(updated.amount.equals(Money.of('30.10', 'PEN'))).toBe(true);
      });

      it('changes the currency keeping the amount', async () => {
        const updated = await correct(await lunch(), { currency: 'USD' });

        expect(updated.amount.equals(Money.of('25.90', 'USD'))).toBe(true);
      });

      // 25.90 soles no se vuelven 25.90 dólares sin que nadie lo diga.
      it('keeps the currency when only the payment method changes', async () => {
        const updated = await correct(await lunch(), { paymentMethodId: USD_ACCOUNT });

        expect(updated.paymentMethodId).toBe(USD_ACCOUNT);
        expect(updated.amount.currency).toBe('PEN');
      });

      it.each(['0', '-1.00'])('rejects the amount %s', async (amount) => {
        await expect(correct(await lunch(), { amount })).rejects.toThrow(
          NonPositiveTransactionAmountError,
        );
      });

      it('rejects a third decimal instead of rounding it', async () => {
        await expect(correct(await lunch(), { amount: '30.105' })).rejects.toThrow(
          InvalidAmountError,
        );
      });
    });

    describe('the date', () => {
      it('moves it to another past day, also of a past month', async () => {
        const updated = await correct(await lunch(), { date: '2026-01-31' });

        expect(updated.date.toString()).toBe('2026-01-31');
      });

      it('rejects a new date after today in Lima', async () => {
        await expect(correct(await lunch(), { date: '2026-09-25' })).rejects.toThrow(
          FutureTransactionDateError,
        );
      });
    });

    describe('the type and category', () => {
      it('moves it to another category of the same type', async () => {
        await expect(correct(await lunch(), { categoryId: SUPERMARKET })).resolves.toMatchObject({
          categoryId: SUPERMARKET,
        });
      });

      it('changes the type together with a category of that type', async () => {
        const updated = await correct(await lunch(), { type: 'FIXED_EXPENSE', categoryId: RENT });

        expect(updated).toMatchObject({ type: 'FIXED_EXPENSE', categoryId: RENT });
      });

      it('rejects changing the type alone: the category would be of another type', async () => {
        await expect(correct(await lunch(), { type: 'FIXED_EXPENSE' })).rejects.toThrow(
          CategoryTypeMismatchError,
        );
      });

      it('rejects a category of another type', async () => {
        await expect(correct(await lunch(), { categoryId: RENT })).rejects.toThrow(
          CategoryTypeMismatchError,
        );
      });

      it('rejects moving it to an archived category', async () => {
        await expect(correct(await lunch(), { categoryId: OLD_FOOD })).rejects.toThrow(
          ArchivedCategoryError,
        );
      });

      // Una archivada sigue en las transacciones viejas, y corregirlas no obliga a sacarlas.
      it('keeps working on a transaction whose category was archived later', async () => {
        const created = await create.execute({ ...LUNCH, categoryId: SUPERMARKET });
        const archivedLater = new FakeCatalogReader()
          .withCategory(ANA, SUPERMARKET, { type: 'VARIABLE_EXPENSE', archived: true })
          .withPaymentMethod(ANA, PAYROLL, { currency: 'PEN' });
        const later = new UpdateTransaction(
          transactions,
          archivedLater,
          events,
          FixedClock.at(NOW),
        );

        await expect(
          later.execute({
            userId: ANA,
            id: created.id,
            changes: { categoryId: SUPERMARKET, type: 'VARIABLE_EXPENSE', amount: '1.00' },
          }),
        ).resolves.toMatchObject({ categoryId: SUPERMARKET });
      });

      it('does not find a category of another account', async () => {
        await expect(correct(await lunch(), { categoryId: BRUNO_FOOD })).rejects.toThrow(
          CategoryNotFoundError,
        );
      });
    });

    describe('the payment method', () => {
      it('takes it out', async () => {
        await expect(correct(await lunch(), { paymentMethodId: null })).resolves.toMatchObject({
          paymentMethodId: null,
        });
      });

      it('rejects changing to an archived one', async () => {
        await expect(correct(await lunch(), { paymentMethodId: OLD_CARD })).rejects.toThrow(
          ArchivedPaymentMethodError,
        );
      });

      it('keeps working on a transaction whose method was archived later', async () => {
        const created = await create.execute(LUNCH);
        const archivedLater = new FakeCatalogReader()
          .withCategory(ANA, FOOD, { type: 'VARIABLE_EXPENSE' })
          .withPaymentMethod(ANA, PAYROLL, { currency: 'PEN', archived: true });
        const later = new UpdateTransaction(
          transactions,
          archivedLater,
          events,
          FixedClock.at(NOW),
        );

        await expect(
          later.execute({ userId: ANA, id: created.id, changes: { paymentMethodId: PAYROLL } }),
        ).resolves.toMatchObject({ paymentMethodId: PAYROLL });
      });

      it('does not find a method of another account', async () => {
        await expect(correct(await lunch(), { paymentMethodId: BRUNO_CARD })).rejects.toThrow(
          PaymentMethodNotFoundError,
        );
      });
    });

    it.each([
      ['of another account', BRUNO],
      ['that is missing', ANA],
    ])('does not find a transaction %s', async (_case, userId) => {
      const id = userId === ANA ? 'transaction-missing' : await lunch();

      await expect(correct(id, { description: 'Menú' }, userId)).rejects.toThrow(
        TransactionNotFoundError,
      );
    });

    it('does not correct a deleted transaction', async () => {
      const id = await lunch();
      await remove.execute({ userId: ANA, id });

      await expect(correct(id, { description: 'Menú' })).rejects.toThrow(TransactionNotFoundError);
    });

    it('saves and announces nothing when a rule breaks', async () => {
      const id = await lunch();

      await expect(correct(id, { description: 'Menú', amount: '0' })).rejects.toThrow();

      await expect(get.execute({ userId: ANA, id })).resolves.toMatchObject({
        description: 'Almuerzo',
      });
      expect(events.published).toEqual([]);
    });
  });

  describe('deleting one', () => {
    it('stops finding it, but keeps the row with when it was deleted', async () => {
      const { id } = await create.execute(LUNCH);

      await remove.execute({ userId: ANA, id });

      await expect(get.execute({ userId: ANA, id })).rejects.toThrow(TransactionNotFoundError);
      expect(transactions.rows).toEqual([
        expect.objectContaining({ id, deletedAt: new Date(NOW) }),
      ]);
    });

    it('announces it exactly once', async () => {
      const { id } = await create.execute(LUNCH);

      await remove.execute({ userId: ANA, id });

      expect(events.published.at(-1)).toEqual({
        name: TRANSACTION_DELETED,
        payload: { userId: ANA, transactionId: id },
      });
      expect(events.published).toHaveLength(2);
    });

    it('does not delete twice', async () => {
      const { id } = await create.execute(LUNCH);
      await remove.execute({ userId: ANA, id });

      await expect(remove.execute({ userId: ANA, id })).rejects.toThrow(TransactionNotFoundError);
      expect(events.published).toHaveLength(2);
    });

    it('does not delete the transaction of another account', async () => {
      const { id } = await create.execute(LUNCH);

      await expect(remove.execute({ userId: BRUNO, id })).rejects.toThrow(TransactionNotFoundError);
      await expect(get.execute({ userId: ANA, id })).resolves.toBeDefined();
    });
  });

  describe('restoring one', () => {
    it('brings back a deleted transaction as it was', async () => {
      const created = await create.execute(LUNCH);
      await remove.execute({ userId: ANA, id: created.id });

      await expect(restore.execute({ userId: ANA, id: created.id })).resolves.toEqual(created);
      await expect(get.execute({ userId: ANA, id: created.id })).resolves.toEqual(created);
    });

    it('announces it exactly once', async () => {
      const { id } = await create.execute(LUNCH);
      await remove.execute({ userId: ANA, id });

      await restore.execute({ userId: ANA, id });

      expect(events.published.at(-1)).toEqual({
        name: TRANSACTION_RESTORED,
        payload: { userId: ANA, transactionId: id },
      });
      expect(events.published).toHaveLength(3);
    });

    // Un doble clic en «Deshacer» no cuenta dos veces.
    it('returns a transaction that is not deleted, announcing nothing', async () => {
      const created = await create.execute(LUNCH);

      await expect(restore.execute({ userId: ANA, id: created.id })).resolves.toEqual(created);
      expect(events.published).toHaveLength(1);
    });

    it('does not restore the transaction of another account', async () => {
      const { id } = await create.execute(LUNCH);
      await remove.execute({ userId: ANA, id });

      await expect(restore.execute({ userId: BRUNO, id })).rejects.toThrow(
        TransactionNotFoundError,
      );
      await expect(get.execute({ userId: ANA, id })).rejects.toThrow(TransactionNotFoundError);
    });
  });
});
