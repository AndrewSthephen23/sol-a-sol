import {
  ArchivedPaymentMethodError,
  FixedClock,
  FutureTransactionDateError,
  Money,
  SameTransferAccountError,
  TransferCurrencyMismatchError,
  TransferReceivedAmountMismatchError,
  TransferReceivedAmountRequiredError,
} from '@sol-a-sol/domain';
import { beforeEach, describe, expect, it } from 'vitest';

import { RecordingEventPublisher } from '../../../shared/events/event-publisher.fake.js';
import { PaymentMethodNotFoundError, TransferNotFoundError } from '../domain/errors.js';
import {
  TRANSFER_CREATED,
  TRANSFER_DELETED,
  TRANSFER_RESTORED,
  TRANSFER_UPDATED,
} from '../domain/events.js';
import { FakeCatalogReader } from '../ports/catalog-reader.fake.js';
import { FakeTransferRepository } from '../ports/transfer-repository.fake.js';
import {
  type CreateTransferInput,
  CreateTransfer,
  DeleteTransfer,
  GetTransfer,
  RestoreTransfer,
  type TransferCorrection,
  UpdateTransfer,
} from './transfers.js';

const ANA = 'user-ana';
const BRUNO = 'user-bruno';
const BCP_SOLES = 'method-bcp-soles';
const YAPE = 'method-yape';
const INTERBANK_DOLLARS = 'method-interbank-dollars';
const CASH = 'method-cash';
const OLD_ACCOUNT = 'method-old-account';
const INTERBANK_SOLES = 'method-interbank-soles';
const BCP_DOLLARS = 'method-bcp-dollars';
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
  let update: UpdateTransfer;
  let remove: DeleteTransfer;
  let restore: RestoreTransfer;
  let catalog: FakeCatalogReader;

  beforeEach(() => {
    transfers = new FakeTransferRepository();
    events = new RecordingEventPublisher();
    catalog = new FakeCatalogReader()
      .withPaymentMethod(ANA, BCP_SOLES, { currency: 'PEN' })
      .withPaymentMethod(ANA, YAPE, { currency: 'PEN' })
      .withPaymentMethod(ANA, INTERBANK_DOLLARS, { currency: 'USD' })
      .withPaymentMethod(ANA, CASH, { currency: null })
      .withPaymentMethod(ANA, OLD_ACCOUNT, { currency: 'PEN', archived: true })
      .withPaymentMethod(ANA, INTERBANK_SOLES, { currency: 'PEN' })
      .withPaymentMethod(ANA, BCP_DOLLARS, { currency: 'USD' })
      .withPaymentMethod(BRUNO, BRUNO_ACCOUNT, { currency: 'PEN' });
    const clock = FixedClock.at(NOW);
    create = new CreateTransfer(transfers, catalog, events, clock);
    get = new GetTransfer(transfers);
    update = new UpdateTransfer(transfers, catalog, events, clock);
    remove = new DeleteTransfer(transfers, events, clock);
    restore = new RestoreTransfer(transfers, events);
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

  describe('correcting one', () => {
    /** Registra y olvida su evento, para mirar solo lo que anuncia la corrección. */
    async function registered(change: Partial<CreateTransferInput> = {}): Promise<string> {
      const created = await create.execute({ ...TO_YAPE, ...change });
      events.published.length = 0;

      return created.id;
    }

    /** Soles de Interbank a dólares de Interbank: 37.50 → 10.00. */
    function exchange(): Promise<string> {
      return registered({
        fromPaymentMethodId: INTERBANK_SOLES,
        toPaymentMethodId: INTERBANK_DOLLARS,
        amount: '37.50',
        receivedAmount: '10.00',
      });
    }

    function correct(id: string, changes: TransferCorrection, userId = ANA) {
      return update.execute({ userId, id, changes });
    }

    it('changes only the date and the description, leaving the money alone', async () => {
      const updated = await correct(await registered(), {
        date: '2026-01-31',
        description: 'Recarga',
      });

      expect(updated.date.toString()).toBe('2026-01-31');
      expect(updated.description).toBe('Recarga');
      expect(plain(updated.amount)).toBe('50.00 PEN');
    });

    it('announces it exactly once', async () => {
      const id = await registered();

      await correct(id, { description: 'Recarga' });

      expect(events.published).toEqual([
        { name: TRANSFER_UPDATED, payload: { userId: ANA, transferId: id } },
      ]);
    });

    it('keeps where it came from', async () => {
      const id = await registered({ source: 'IMPORT' });

      await expect(correct(id, { amount: '60.00' })).resolves.toMatchObject({ source: 'IMPORT' });
    });

    describe('in the same currency', () => {
      it('moves the amount received together with the amount sent', async () => {
        const updated = await correct(await registered(), { amount: '60.00' });

        expect(plain(updated.amount)).toBe('60.00 PEN');
        expect(plain(updated.receivedAmount)).toBe('60.00 PEN');
      });

      it('changes an account for another of the same currency', async () => {
        const updated = await correct(await registered(), {
          fromPaymentMethodId: INTERBANK_SOLES,
        });

        expect(updated.fromPaymentMethodId).toBe(INTERBANK_SOLES);
        expect(plain(updated.receivedAmount)).toBe('50.00 PEN');
      });
    });

    describe('in a currency change', () => {
      // Decidido con el autor el 2026-09-28: cambiar uno solo movería el tipo de cambio.
      it('asks for the amount received again when the amount sent changes', async () => {
        await expect(correct(await exchange(), { amount: '38.00' })).rejects.toThrow(
          TransferReceivedAmountRequiredError,
        );
      });

      it('changes both amounts together', async () => {
        const updated = await correct(await exchange(), {
          amount: '38.00',
          receivedAmount: '10.10',
        });

        expect(plain(updated.amount)).toBe('38.00 PEN');
        expect(plain(updated.receivedAmount)).toBe('10.10 USD');
      });

      it('keeps the amount sent when only the amount received changes', async () => {
        const updated = await correct(await exchange(), { receivedAmount: '9.90' });

        expect(plain(updated.amount)).toBe('37.50 PEN');
        expect(plain(updated.receivedAmount)).toBe('9.90 USD');
      });

      it('keeps both amounts when only the origin changes to another account in soles', async () => {
        const updated = await correct(await exchange(), { fromPaymentMethodId: BCP_SOLES });

        expect(plain(updated.amount)).toBe('37.50 PEN');
        expect(plain(updated.receivedAmount)).toBe('10.00 USD');
      });

      it('keeps both amounts when only the destination changes to another account in dollars', async () => {
        const updated = await correct(await exchange(), { toPaymentMethodId: BCP_DOLLARS });

        expect(updated.toPaymentMethodId).toBe(BCP_DOLLARS);
        expect(plain(updated.receivedAmount)).toBe('10.00 USD');
      });

      it('turns into a same-currency transfer when the destination is in soles', async () => {
        const updated = await correct(await exchange(), { toPaymentMethodId: YAPE });

        expect(plain(updated.receivedAmount)).toBe('37.50 PEN');
      });
    });

    // El efectivo acepta las dos monedas: recibe la que sale de la cuenta nueva.
    it('lets cash follow the currency of a new origin', async () => {
      const id = await registered({ toPaymentMethodId: CASH });

      const updated = await correct(id, { fromPaymentMethodId: BCP_DOLLARS });

      expect(plain(updated.amount)).toBe('50.00 USD');
      expect(plain(updated.receivedAmount)).toBe('50.00 USD');
    });

    it('asks for the amount received when a same-currency transfer becomes a change', async () => {
      await expect(
        correct(await registered(), { toPaymentMethodId: INTERBANK_DOLLARS }),
      ).rejects.toThrow(TransferReceivedAmountRequiredError);
    });

    it('rejects a different amount received in the same currency', async () => {
      await expect(correct(await registered(), { receivedAmount: '49.00' })).rejects.toThrow(
        TransferReceivedAmountMismatchError,
      );
    });

    it('rejects a currency the account does not hold', async () => {
      await expect(correct(await registered(), { currency: 'USD' })).rejects.toThrow(
        TransferCurrencyMismatchError,
      );
    });

    it('rejects leaving the same account on both sides', async () => {
      await expect(correct(await registered(), { toPaymentMethodId: BCP_SOLES })).rejects.toThrow(
        SameTransferAccountError,
      );
    });

    it('rejects a new date after today in Lima', async () => {
      await expect(correct(await registered(), { date: '2026-09-25' })).rejects.toThrow(
        FutureTransactionDateError,
      );
    });

    it('rejects choosing an archived account now', async () => {
      await expect(correct(await registered(), { toPaymentMethodId: OLD_ACCOUNT })).rejects.toThrow(
        ArchivedPaymentMethodError,
      );
    });

    // Como con las transacciones: lo archivado después sigue en lo ya registrado.
    it('keeps working on a transfer whose account was archived later', async () => {
      const id = await registered();
      catalog.withPaymentMethod(ANA, YAPE, { currency: 'PEN', archived: true });

      await expect(correct(id, { amount: '60.00' })).resolves.toMatchObject({
        toPaymentMethodId: YAPE,
      });
    });

    it('does not find an account of another user', async () => {
      await expect(
        correct(await registered(), { toPaymentMethodId: BRUNO_ACCOUNT }),
      ).rejects.toThrow(PaymentMethodNotFoundError);
    });

    it.each([
      ['of another account', BRUNO],
      ['that is missing', ANA],
    ])('does not find a transfer %s', async (_case, userId) => {
      const id = userId === ANA ? 'transfer-missing' : await registered();

      await expect(correct(id, { description: 'Otra' }, userId)).rejects.toThrow(
        TransferNotFoundError,
      );
    });

    it('does not correct a deleted transfer', async () => {
      const id = await registered();
      await remove.execute({ userId: ANA, id });

      await expect(correct(id, { description: 'Otra' })).rejects.toThrow(TransferNotFoundError);
    });

    it('saves and announces nothing when a rule breaks', async () => {
      const id = await registered();

      await expect(correct(id, { description: 'Otra', amount: '0' })).rejects.toThrow();

      await expect(get.execute({ userId: ANA, id })).resolves.toMatchObject({
        description: 'Paso a Yape',
      });
      expect(events.published).toEqual([]);
    });
  });

  describe('deleting and restoring one', () => {
    it('stops finding a deleted one and keeps the row', async () => {
      const { id } = await create.execute(TO_YAPE);

      await remove.execute({ userId: ANA, id });

      await expect(get.execute({ userId: ANA, id })).rejects.toThrow(TransferNotFoundError);
      expect(transfers.rows).toEqual([expect.objectContaining({ id, deletedAt: new Date(NOW) })]);
      expect(events.published.at(-1)).toEqual({
        name: TRANSFER_DELETED,
        payload: { userId: ANA, transferId: id },
      });
    });

    it('does not delete twice nor what belongs to another account', async () => {
      const { id } = await create.execute(TO_YAPE);

      await expect(remove.execute({ userId: BRUNO, id })).rejects.toThrow(TransferNotFoundError);
      await remove.execute({ userId: ANA, id });
      await expect(remove.execute({ userId: ANA, id })).rejects.toThrow(TransferNotFoundError);
      expect(events.published).toHaveLength(2);
    });

    it('brings back a deleted one as it was, announcing it once', async () => {
      const created = await create.execute(TO_YAPE);
      await remove.execute({ userId: ANA, id: created.id });

      await expect(restore.execute({ userId: ANA, id: created.id })).resolves.toEqual(created);
      expect(events.published.at(-1)).toEqual({
        name: TRANSFER_RESTORED,
        payload: { userId: ANA, transferId: created.id },
      });
      expect(events.published).toHaveLength(3);
    });

    it('returns one that is not deleted, announcing nothing', async () => {
      const created = await create.execute(TO_YAPE);

      await expect(restore.execute({ userId: ANA, id: created.id })).resolves.toEqual(created);
      expect(events.published).toHaveLength(1);
    });

    it('does not restore the transfer of another account', async () => {
      const { id } = await create.execute(TO_YAPE);
      await remove.execute({ userId: ANA, id });

      await expect(restore.execute({ userId: BRUNO, id })).rejects.toThrow(TransferNotFoundError);
      await expect(get.execute({ userId: ANA, id })).rejects.toThrow(TransferNotFoundError);
    });
  });
});
