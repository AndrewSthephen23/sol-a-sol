import {
  CategoryTypeMismatchError,
  FixedClock,
  FutureTransactionDateError,
  LocalDate,
  Money,
} from '@sol-a-sol/domain';
import { beforeEach, describe, expect, it } from 'vitest';

import { RecordingEventPublisher } from '../../../shared/events/event-publisher.fake.js';
import { CategoryNotFoundError } from '../domain/errors.js';
import { TRANSACTION_CREATED } from '../domain/events.js';
import { FakeCatalogReader } from '../ports/catalog-reader.fake.js';
import { FakeTransactionRepository } from '../ports/transaction-repository.fake.js';
import { type CapturedTransaction, TransactionsRecorder } from './transactions-recorder.js';
import { CreateTransaction } from './transactions.js';

const ANA = 'user-ana';
const BRUNO = 'user-bruno';
// 4 de octubre de 2026 en Lima.
const NOW = '2026-10-04T15:00:00.000Z';

const LUNCH: CapturedTransaction = {
  captureId: 'capture-1',
  date: LocalDate.parse('2026-10-03'),
  type: 'VARIABLE_EXPENSE',
  categoryId: 'food',
  amount: Money.of('25.90', 'PEN'),
  paymentMethodId: 'visa',
  merchant: 'Tambo',
  description: 'Almuerzo',
  source: 'ANDROID_AUTOMATION',
};

describe('TransactionsRecorder', () => {
  let transactions: FakeTransactionRepository;
  let events: RecordingEventPublisher;
  let recorder: TransactionsRecorder;

  beforeEach(() => {
    transactions = new FakeTransactionRepository();
    events = new RecordingEventPublisher();
    const catalog = new FakeCatalogReader()
      .withCategory(ANA, 'food', { type: 'VARIABLE_EXPENSE' })
      .withCategory(BRUNO, 'bruno-food', { type: 'VARIABLE_EXPENSE' })
      .withPaymentMethod(ANA, 'visa', { currency: null });
    const create = new CreateTransaction(transactions, catalog, events, FixedClock.at(NOW));
    recorder = new TransactionsRecorder(create, transactions);
  });

  it('records the transaction of a capture, with its source and its capture', async () => {
    const { transactionId, created } = await recorder.recordFromCapture(ANA, LUNCH);

    expect(created).toBe(true);
    const transaction = await transactions.find(ANA, transactionId);
    expect(transaction).toMatchObject({
      type: 'VARIABLE_EXPENSE',
      categoryId: 'food',
      paymentMethodId: 'visa',
      merchant: 'Tambo',
      description: 'Almuerzo',
      source: 'ANDROID_AUTOMATION',
      captureId: 'capture-1',
    });
    expect(transaction?.amount.toFixed()).toBe('25.90');
    expect(transaction?.amount.currency).toBe('PEN');
    expect(transaction?.date.toString()).toBe('2026-10-03');
    expect(events.published.map(({ name }) => name)).toEqual([TRANSACTION_CREATED]);
  });

  // Dos confirmaciones a la vez, o una que se cortó después de crear la transacción.
  it('gives back the transaction a capture already has, without another one', async () => {
    const first = await recorder.recordFromCapture(ANA, LUNCH);

    const second = await recorder.recordFromCapture(ANA, { ...LUNCH, description: 'Otra' });

    expect(second).toEqual({ transactionId: first.transactionId, created: false });
    expect(transactions.rows).toHaveLength(1);
  });

  it('finds it even if it was deleted afterwards', async () => {
    const first = await recorder.recordFromCapture(ANA, LUNCH);
    await transactions.softDelete(ANA, first.transactionId, new Date(NOW));

    await expect(recorder.recordFromCapture(ANA, LUNCH)).resolves.toEqual({
      transactionId: first.transactionId,
      created: false,
    });
  });

  it.each([
    ['a category of another account', { categoryId: 'bruno-food' }, CategoryNotFoundError],
    ['a category of another type', { type: 'INCOME' as const }, CategoryTypeMismatchError],
    ['a future date', { date: LocalDate.parse('2026-10-05') }, FutureTransactionDateError],
  ])('applies the rules of any transaction: refuses %s', async (_label, changes, error) => {
    await expect(recorder.recordFromCapture(ANA, { ...LUNCH, ...changes })).rejects.toBeInstanceOf(
      error,
    );
    expect(transactions.rows).toHaveLength(0);
  });

  it('lets other errors of the repository through', async () => {
    const failure = new Error('la base se cayó');
    transactions.create = () => Promise.reject(failure);

    await expect(recorder.recordFromCapture(ANA, LUNCH)).rejects.toBe(failure);
  });
});
