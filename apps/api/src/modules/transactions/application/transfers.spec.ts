import {
  ArchivedPaymentMethodError,
  FixedClock,
  FutureTransactionDateError,
  Money,
  SameTransferAccountError,
  TransferCurrencyMismatchError,
  TransferReceivedAmountRequiredError,
} from '@sol-a-sol/domain';
import { beforeEach, describe, expect, it } from 'vitest';

import { RecordingEventPublisher } from '../../../shared/events/event-publisher.fake.js';
import { PaymentMethodNotFoundError, TransferNotFoundError } from '../domain/errors.js';
import { TRANSFER_CREATED } from '../domain/events.js';
import { FakeCatalogReader } from '../ports/catalog-reader.fake.js';
import { FakeTransferRepository } from '../ports/transfer-repository.fake.js';
import { type CreateTransferInput, CreateTransfer, GetTransfer } from './transfers.js';

const ANA = 'user-ana';
const BRUNO = 'user-bruno';
const BCP_SOLES = 'method-bcp-soles';
const YAPE = 'method-yape';
const INTERBANK_DOLLARS = 'method-interbank-dollars';
const CASH = 'method-cash';
const OLD_ACCOUNT = 'method-old-account';
const BRUNO_ACCOUNT = 'method-bruno';
/** Las 21:30 del 24/09/2026 en Lima: en UTC ya es el 25. */
const NOW = '2026-09-25T02:30:00.000Z';

const TO_YAPE: CreateTransferInput = {
  userId: ANA,
  date: '2026-09-24',
  fromPaymentMethodId: BCP_SOLES,
  toPaymentMethodId: YAPE,
  amount: '50.00',
  description: 'Paso a Yape',
  source: 'MANUAL',
};

function plain(money: Money): string {
  return `${money.toFixed()} ${money.currency}`;
}

describe('transfers', () => {
  let transfers: FakeTransferRepository;
  let events: RecordingEventPublisher;
  let create: CreateTransfer;
  let get: GetTransfer;

  beforeEach(() => {
    transfers = new FakeTransferRepository();
    events = new RecordingEventPublisher();
    const catalog = new FakeCatalogReader()
      .withPaymentMethod(ANA, BCP_SOLES, { currency: 'PEN' })
      .withPaymentMethod(ANA, YAPE, { currency: 'PEN' })
      .withPaymentMethod(ANA, INTERBANK_DOLLARS, { currency: 'USD' })
      .withPaymentMethod(ANA, CASH, { currency: null })
      .withPaymentMethod(ANA, OLD_ACCOUNT, { currency: 'PEN', archived: true })
      .withPaymentMethod(BRUNO, BRUNO_ACCOUNT, { currency: 'PEN' });
    create = new CreateTransfer(transfers, catalog, events, FixedClock.at(NOW));
    get = new GetTransfer(transfers);
  });

  describe('registering one', () => {
    it('moves the money between two accounts of the same currency', async () => {
      const created = await create.execute(TO_YAPE);

      expect(created).toMatchObject({
        fromPaymentMethodId: BCP_SOLES,
        toPaymentMethodId: YAPE,
        description: 'Paso a Yape',
        source: 'MANUAL',
      });
      expect(created.date.toString()).toBe('2026-09-24');
      expect(plain(created.amount)).toBe('50.00 PEN');
      expect(plain(created.receivedAmount)).toBe('50.00 PEN');
    });

    it('keeps both amounts of a currency change, as copied from the voucher', async () => {
      const created = await create.execute({
        ...TO_YAPE,
        toPaymentMethodId: INTERBANK_DOLLARS,
        amount: '37.50',
        receivedAmount: '10.00',
      });

      expect(plain(created.amount)).toBe('37.50 PEN');
      expect(plain(created.receivedAmount)).toBe('10.00 USD');
    });

    it('keeps it for the account that registered it', async () => {
      const created = await create.execute(TO_YAPE);

      expect(transfers.rows).toEqual([expect.objectContaining({ id: created.id, userId: ANA })]);
    });

    it('announces it exactly once, with who and which one', async () => {
      const created = await create.execute(TO_YAPE);

      expect(events.published).toEqual([
        { name: TRANSFER_CREATED, payload: { userId: ANA, transferId: created.id } },
      ]);
    });

    it('rejects moving money to the same account', async () => {
      await expect(create.execute({ ...TO_YAPE, toPaymentMethodId: BCP_SOLES })).rejects.toThrow(
        SameTransferAccountError,
      );
    });

    it('rejects a currency change without the amount received', async () => {
      await expect(
        create.execute({ ...TO_YAPE, toPaymentMethodId: INTERBANK_DOLLARS }),
      ).rejects.toThrow(TransferReceivedAmountRequiredError);
    });

    it('rejects a currency that the account does not hold', async () => {
      await expect(create.execute({ ...TO_YAPE, currency: 'USD' })).rejects.toThrow(
        TransferCurrencyMismatchError,
      );
    });

    it('takes cash in the currency that left the account', async () => {
      const created = await create.execute({ ...TO_YAPE, toPaymentMethodId: CASH });

      expect(plain(created.receivedAmount)).toBe('50.00 PEN');
    });

    it('rejects a date after today in Lima', async () => {
      await expect(create.execute({ ...TO_YAPE, date: '2026-09-25' })).rejects.toThrow(
        FutureTransactionDateError,
      );
    });

    it.each([
      ['origin', { fromPaymentMethodId: OLD_ACCOUNT }],
      ['destination', { toPaymentMethodId: OLD_ACCOUNT }],
    ])('rejects an archived %s', async (_case, change) => {
      await expect(create.execute({ ...TO_YAPE, ...change })).rejects.toThrow(
        ArchivedPaymentMethodError,
      );
    });

    it.each([
      ['an origin of another account', { fromPaymentMethodId: BRUNO_ACCOUNT }],
      ['a destination of another account', { toPaymentMethodId: BRUNO_ACCOUNT }],
      ['a missing origin', { fromPaymentMethodId: 'method-missing' }],
      ['a missing destination', { toPaymentMethodId: 'method-missing' }],
    ])('does not find %s', async (_case, change) => {
      await expect(create.execute({ ...TO_YAPE, ...change })).rejects.toThrow(
        PaymentMethodNotFoundError,
      );
    });

    it('saves and announces nothing when a rule breaks', async () => {
      await expect(create.execute({ ...TO_YAPE, amount: '0' })).rejects.toThrow();

      expect(transfers.rows).toEqual([]);
      expect(events.published).toEqual([]);
    });
  });

  describe('reading one', () => {
    it('returns an own transfer', async () => {
      const created = await create.execute(TO_YAPE);

      await expect(get.execute({ userId: ANA, id: created.id })).resolves.toEqual(created);
    });

    it('does not find the transfer of another account', async () => {
      const created = await create.execute(TO_YAPE);

      await expect(get.execute({ userId: BRUNO, id: created.id })).rejects.toThrow(
        TransferNotFoundError,
      );
    });

    it('does not find a deleted transfer', async () => {
      const created = await create.execute(TO_YAPE);
      for (const row of transfers.rows) row.deletedAt = new Date(NOW);

      await expect(get.execute({ userId: ANA, id: created.id })).rejects.toThrow(
        TransferNotFoundError,
      );
    });
  });
});
