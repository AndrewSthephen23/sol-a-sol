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
  type ListTransactionsInput,
  ListTransactions,
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
const DELIVERY = 'category-delivery';
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
  let list: ListTransactions;

  beforeEach(() => {
    transactions = new FakeTransactionRepository();
    events = new RecordingEventPublisher();
    const catalog = new FakeCatalogReader()
      .withCategory(ANA, FOOD, { type: 'VARIABLE_EXPENSE' })
      .withCategory(ANA, SALARY, { type: 'INCOME' })
      .withCategory(ANA, NETFLIX, { type: 'FIXED_EXPENSE', archived: true })
      .withCategory(ANA, SUPERMARKET, { type: 'VARIABLE_EXPENSE' })
      .withCategory(ANA, DELIVERY, { type: 'VARIABLE_EXPENSE', parentId: FOOD })
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
    list = new ListTransactions(transactions, catalog);
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

  describe('listing', () => {
    /** Registra varias, en el orden dado (el id crece con cada una, como un UUIDv7). */
    async function registerAll(...changes: Partial<CreateTransactionInput>[]): Promise<string[]> {
      const ids: string[] = [];
      for (const change of changes) {
        ids.push((await create.execute({ ...LUNCH, ...change })).id);
      }

      return ids;
    }

    function page(input: Partial<ListTransactionsInput> = {}) {
      return list.execute({ userId: ANA, after: null, limit: 50, ...input });
    }

    async function idsOf(input: Partial<ListTransactionsInput> = {}): Promise<string[]> {
      return (await page(input)).items.map((item) => item.id);
    }

    it('goes from the newest date and, within a day, from the last registered', async () => {
      const [old, first, second] = await registerAll(
        { date: '2026-09-01' },
        { date: '2026-09-10' },
        { date: '2026-09-10' },
      );

      await expect(idsOf()).resolves.toEqual([second, first, old]);
    });

    describe('by pages', () => {
      it('follows the cursor to the end without repeating or skipping', async () => {
        const all = await registerAll(
          { date: '2026-09-05' },
          { date: '2026-09-04' },
          { date: '2026-09-04' },
          { date: '2026-09-03' },
          { date: '2026-09-02' },
        );
        const seen: string[] = [];
        let after = null;

        for (;;) {
          const current = await page({ after, limit: 2 });
          seen.push(...current.items.map((item) => item.id));
          if (current.next === null) break;
          after = current.next;
        }

        expect(seen.toSorted()).toEqual(all.toSorted());
        expect(new Set(seen).size).toBe(all.length);
      });

      it('says there is no next page when the last one is exactly full', async () => {
        await registerAll({}, {});

        await expect(page({ limit: 2 })).resolves.toMatchObject({ next: null });
      });

      it('points the next page at the last row delivered', async () => {
        const [older, newer] = await registerAll({ date: '2026-09-01' }, { date: '2026-09-02' });

        const first = await page({ limit: 1 });

        expect(first.items.map((item) => item.id)).toEqual([newer]);
        expect(first.next?.id).toBe(newer);
        await expect(idsOf({ after: first.next, limit: 1 })).resolves.toEqual([older]);
      });

      // Con números de página, un alta entre dos páginas repetiría una fila.
      it('is not moved by what is registered or deleted between two pages', async () => {
        const [a, b, c, d] = await registerAll(
          { date: '2026-09-04' },
          { date: '2026-09-03' },
          { date: '2026-09-02' },
          { date: '2026-09-01' },
        );
        const first = await page({ limit: 2 });
        await registerAll({ date: '2026-09-05' });
        await remove.execute({ userId: ANA, id: a ?? '' });

        const second = await page({ after: first.next, limit: 2 });

        expect(first.items.map((item) => item.id)).toEqual([a, b]);
        expect(second.items.map((item) => item.id)).toEqual([c, d]);
      });
    });

    describe('filters', () => {
      it('by month, from its first to its last day', async () => {
        const [, first, last] = await registerAll(
          { date: '2026-07-31' },
          { date: '2026-08-01' },
          { date: '2026-08-31' },
          { date: '2026-09-01' },
        );

        await expect(idsOf({ month: '2026-08' })).resolves.toEqual([last, first]);
      });

      it('by a range, both ends included', async () => {
        const [, from, to] = await registerAll(
          { date: '2026-09-01' },
          { date: '2026-09-02' },
          { date: '2026-09-03' },
          { date: '2026-09-04' },
        );

        await expect(idsOf({ from: '2026-09-02', to: '2026-09-03' })).resolves.toEqual([to, from]);
      });

      it('by only one end of the range', async () => {
        const [older, newer] = await registerAll({ date: '2026-09-01' }, { date: '2026-09-03' });

        await expect(idsOf({ from: '2026-09-02' })).resolves.toEqual([newer]);
        await expect(idsOf({ to: '2026-09-02' })).resolves.toEqual([older]);
      });

      it('by type', async () => {
        const [, salary] = await registerAll({}, { type: 'INCOME', categoryId: SALARY });

        await expect(idsOf({ type: 'INCOME' })).resolves.toEqual([salary]);
      });

      // Nadie espera que «Comida» deje fuera «Comida > Delivery».
      it('by a category, bringing its subcategories too', async () => {
        const [food, delivery] = await registerAll(
          {},
          { categoryId: DELIVERY },
          { categoryId: SUPERMARKET },
        );

        await expect(idsOf({ categoryId: FOOD })).resolves.toEqual([delivery, food]);
        await expect(idsOf({ categoryId: DELIVERY })).resolves.toEqual([delivery]);
      });

      it('by a category of another account, finding nothing and saying nothing', async () => {
        await registerAll({});

        await expect(page({ categoryId: BRUNO_FOOD })).resolves.toEqual({
          items: [],
          next: null,
          totals: [],
        });
      });

      it('by payment method and by currency', async () => {
        const [, usd] = await registerAll({}, { paymentMethodId: null, currency: 'USD' });

        await expect(idsOf({ paymentMethodId: PAYROLL })).resolves.not.toContain(usd);
        await expect(idsOf({ currency: 'USD' })).resolves.toEqual([usd]);
      });

      it('by text, in the description or the merchant, ignoring case and accents', async () => {
        const [menu, tambo] = await registerAll(
          { description: 'Menú del día', merchant: null },
          { description: 'Galletas', merchant: 'TAMBO' },
          { description: 'Pasajes', merchant: 'Metropolitano' },
        );

        await expect(idsOf({ q: 'MENU' })).resolves.toEqual([menu]);
        await expect(idsOf({ q: 'tambó' })).resolves.toEqual([tambo]);
      });

      it('combined', async () => {
        const [match] = await registerAll(
          { date: '2026-09-10', description: 'Menú' },
          { date: '2026-08-10', description: 'Menú' },
          { date: '2026-09-10', description: 'Pasajes' },
        );

        await expect(
          idsOf({ month: '2026-09', q: 'menu', type: 'VARIABLE_EXPENSE' }),
        ).resolves.toEqual([match]);
      });
    });

    it('leaves out the deleted ones', async () => {
      const [kept, deleted] = await registerAll({}, {});
      await remove.execute({ userId: ANA, id: deleted ?? '' });

      await expect(idsOf()).resolves.toEqual([kept]);
    });

    it('never shows what belongs to another account', async () => {
      await registerAll({}, {});

      await expect(list.execute({ userId: BRUNO, after: null, limit: 50 })).resolves.toEqual({
        items: [],
        next: null,
        totals: [],
      });
    });

    describe('totals', () => {
      it('add up everything filtered, not only the page', async () => {
        await registerAll(
          { type: 'INCOME', categoryId: SALARY, amount: '1000.00' },
          { amount: '25.90' },
          { amount: '4.10' },
        );

        const { items, totals } = await page({ limit: 1 });

        expect(items).toHaveLength(1);
        expect(totals).toHaveLength(1);
        expect(totals[0]?.income.toFixed()).toBe('1000.00');
        expect(totals[0]?.expense.toFixed()).toBe('30.00');
        expect(totals[0]?.balance.toFixed()).toBe('970.00');
      });

      it('follow the filter', async () => {
        await registerAll({ amount: '25.90' }, { amount: '4.10', date: '2026-08-01' });

        const { totals } = await page({ month: '2026-09' });

        expect(totals[0]?.expense.toFixed()).toBe('25.90');
      });

      it('keep each currency apart', async () => {
        await registerAll({}, { paymentMethodId: null, currency: 'USD', amount: '10.00' });

        const { totals } = await page();

        expect(totals.map((total) => [total.currency, total.expense.toFixed()])).toEqual([
          ['PEN', '25.90'],
          ['USD', '10.00'],
        ]);
      });
    });
  });
});
