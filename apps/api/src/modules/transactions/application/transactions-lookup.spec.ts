import { LocalDate, Money } from '@sol-a-sol/domain';
import { beforeEach, describe, expect, it } from 'vitest';

import { FakeTransactionRepository } from '../ports/transaction-repository.fake.js';
import { FakeTransferRepository } from '../ports/transfer-repository.fake.js';
import { TransactionsLookup } from './transactions-lookup.js';

const ANA = 'user-ana';
const BRUNO = 'user-bruno';

describe('TransactionsLookup', () => {
  let transactions: FakeTransactionRepository;
  let transfers: FakeTransferRepository;
  let lookup: TransactionsLookup;

  async function spend(
    userId: string,
    date: string,
    categoryId: string,
    amount: Money,
    merchant: string | null = null,
  ) {
    return transactions.create({
      userId,
      date: LocalDate.parse(date),
      type: 'VARIABLE_EXPENSE',
      categoryId,
      amount,
      description: 'Gasto',
      paymentMethodId: null,
      merchant,
      source: 'MANUAL',
      tags: [],
    });
  }

  beforeEach(() => {
    transactions = new FakeTransactionRepository();
    transfers = new FakeTransferRepository();
    lookup = new TransactionsLookup(transactions, transfers);
  });

  it('gives the totals of a date range by category, type and currency', async () => {
    await spend(ANA, '2026-09-01', 'food', Money.of('10', 'PEN'));
    await spend(ANA, '2026-09-30', 'food', Money.of('5', 'USD'));

    const totals = await lookup.totalsByCategory(
      ANA,
      LocalDate.parse('2026-09-01'),
      LocalDate.parse('2026-09-30'),
    );

    expect(
      totals.map((total) => [
        total.categoryId,
        total.type,
        total.amount.currency,
        total.amount.toFixed(),
      ]),
    ).toEqual([
      ['food', 'VARIABLE_EXPENSE', 'PEN', '10.00'],
      ['food', 'VARIABLE_EXPENSE', 'USD', '5.00'],
    ]);
  });

  it('leaves out other dates, deleted transactions and other accounts', async () => {
    await spend(ANA, '2026-08-31', 'food', Money.of('1', 'PEN'));
    await spend(ANA, '2026-10-01', 'food', Money.of('1', 'PEN'));
    const deleted = await spend(ANA, '2026-09-15', 'food', Money.of('1', 'PEN'));
    await transactions.softDelete(ANA, deleted.id, new Date());
    await spend(BRUNO, '2026-09-15', 'food', Money.of('1', 'PEN'));

    await expect(
      lookup.totalsByCategory(ANA, LocalDate.parse('2026-09-01'), LocalDate.parse('2026-09-30')),
    ).resolves.toEqual([]);
  });

  it('gives the totals by merchant as written, leaving out the ones without merchant', async () => {
    await spend(ANA, '2026-09-01', 'food', Money.of('10', 'PEN'), ' Tambo ');
    await spend(ANA, '2026-09-02', 'food', Money.of('5', 'PEN'), null);
    await spend(ANA, '2026-09-03', 'food', Money.of('5', 'PEN'), '   ');
    await spend(ANA, '2026-10-01', 'food', Money.of('99', 'PEN'), 'Tambo');
    await spend(BRUNO, '2026-09-01', 'food', Money.of('99', 'PEN'), 'Tambo');

    const totals = await lookup.totalsByMerchant(
      ANA,
      LocalDate.parse('2026-09-01'),
      LocalDate.parse('2026-09-30'),
    );

    expect(
      totals.map((total) => [total.merchant, total.type, total.amount.toFixed(), total.count]),
    ).toEqual([['Tambo', 'VARIABLE_EXPENSE', '10.00', 1]]);
  });

  it('gives the totals of each day, and only of the range', async () => {
    await spend(ANA, '2026-09-01', 'food', Money.of('10', 'PEN'));
    await spend(ANA, '2026-09-01', 'rent', Money.of('5', 'PEN'));
    await spend(ANA, '2026-10-01', 'food', Money.of('99', 'PEN'));
    await spend(BRUNO, '2026-09-01', 'food', Money.of('99', 'PEN'));

    const totals = await lookup.totalsByDay(
      ANA,
      LocalDate.parse('2026-09-01'),
      LocalDate.parse('2026-09-30'),
    );

    expect(totals.map((total) => [total.date.toString(), total.amount.toFixed()])).toEqual([
      ['2026-09-01', '10.00'],
      ['2026-09-01', '5.00'],
    ]);
  });

  describe('paymentMethodTotalsByDay', () => {
    const CARD = 'method-card';
    const SAVINGS = 'method-savings';
    const until = LocalDate.parse('2026-09-30');

    async function charge(userId: string, date: string, type: 'INCOME' | 'DEBT', method = CARD) {
      return transactions.create({
        userId,
        date: LocalDate.parse(date),
        type,
        categoryId: 'any',
        amount: Money.of('10', 'PEN'),
        description: 'Con la tarjeta',
        paymentMethodId: method,
        merchant: null,
        source: 'MANUAL',
        tags: [],
      });
    }

    async function transfer(userId: string, date: string, from: string, to: string) {
      return transfers.create({
        userId,
        date: LocalDate.parse(date),
        fromPaymentMethodId: from,
        toPaymentMethodId: to,
        amount: Money.of('370', 'PEN'),
        receivedAmount: Money.of('100', 'USD'),
        description: 'Pago',
        source: 'MANUAL',
      });
    }

    function plain(totals: Awaited<ReturnType<TransactionsLookup['paymentMethodTotalsByDay']>>) {
      return totals.map((total) => [
        total.date.toString(),
        total.kind,
        total.amount.currency,
        total.amount.toFixed(),
      ]);
    }

    it('gives the transactions with the method by type, and the transfers by direction', async () => {
      await charge(ANA, '2026-09-10', 'DEBT');
      await charge(ANA, '2026-09-11', 'INCOME');
      await transfer(ANA, '2026-09-12', SAVINGS, CARD);
      await transfer(ANA, '2026-09-13', CARD, SAVINGS);

      expect(plain(await lookup.paymentMethodTotalsByDay(ANA, CARD, until))).toEqual([
        ['2026-09-10', 'DEBT', 'PEN', '10.00'],
        ['2026-09-11', 'INCOME', 'PEN', '10.00'],
        // Lo que llegó a la tarjeta, en su moneda; y lo que salió de ella.
        ['2026-09-12', 'TRANSFER_IN', 'USD', '100.00'],
        ['2026-09-13', 'TRANSFER_OUT', 'PEN', '370.00'],
      ]);
    });

    it('leaves out later days, other methods, deleted movements and other accounts', async () => {
      await charge(ANA, '2026-10-01', 'DEBT');
      await charge(ANA, '2026-09-10', 'DEBT', SAVINGS);
      await charge(BRUNO, '2026-09-10', 'DEBT');
      const gone = await charge(ANA, '2026-09-10', 'DEBT');
      await transactions.softDelete(ANA, gone.id, new Date());
      await transfer(ANA, '2026-10-01', SAVINGS, CARD);
      await transfer(BRUNO, '2026-09-12', SAVINGS, CARD);
      const undone = await transfer(ANA, '2026-09-12', SAVINGS, CARD);
      await transfers.softDelete(ANA, undone.id, new Date());

      await expect(lookup.paymentMethodTotalsByDay(ANA, CARD, until)).resolves.toEqual([]);
    });
  });

  describe('liveTransactions', () => {
    it('gives the live ones of the account, once each, and nothing else', async () => {
      const kept = await spend(ANA, '2026-09-10', 'food', Money.of('25.50', 'PEN'));
      const gone = await spend(ANA, '2026-09-11', 'food', Money.of('1', 'PEN'));
      await transactions.softDelete(ANA, gone.id, new Date());
      const hers = await spend(BRUNO, '2026-09-12', 'food', Money.of('1', 'PEN'));

      const found = await lookup.liveTransactions(ANA, [
        kept.id,
        kept.id,
        gone.id,
        hers.id,
        'none',
      ]);

      expect(
        found.map((entry) => [
          entry.id,
          entry.date.toString(),
          entry.type,
          entry.amount.toFixed(),
          entry.paymentMethodId,
          entry.description,
        ]),
      ).toEqual([[kept.id, '2026-09-10', 'VARIABLE_EXPENSE', '25.50', null, 'Gasto']]);
    });
  });
});
