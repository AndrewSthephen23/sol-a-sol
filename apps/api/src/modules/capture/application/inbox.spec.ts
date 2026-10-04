import {
  ArchivedCategoryError,
  ArchivedPaymentMethodError,
  CaptureNotDiscardedError,
  CaptureNotPendingError,
  CategoryTypeMismatchError,
  FixedClock,
  FutureTransactionDateError,
  LocalDate,
} from '@sol-a-sol/domain';
import { beforeEach, describe, expect, it } from 'vitest';

import {
  CaptureCategoryNotFoundError,
  CaptureNotFoundError,
  CapturePaymentMethodNotFoundError,
} from '../domain/errors.js';
import type { NewCapture } from '../ports/capture-repository.js';
import { FakeCaptureRepository } from '../ports/capture-repository.fake.js';
import { FakeCaptureCatalogReader } from '../ports/catalog-reader.fake.js';
import {
  CorrectCapture,
  DiscardCapture,
  GetCapture,
  ListCaptures,
  PurgeDiscardedCaptures,
  RestoreCapture,
} from './inbox.js';

const ANA = 'user-ana';
const BRUNO = 'user-bruno';
// 4 de octubre de 2026, 10:00 en Lima.
const NOW = new Date('2026-10-04T15:00:00.000Z');

let keys = 0;

function capture(extra: Partial<NewCapture> = {}): NewCapture {
  keys += 1;
  return {
    source: 'IOS_SHORTCUT',
    status: 'PENDING',
    type: 'VARIABLE_EXPENSE',
    occurredAt: new Date('2026-10-03T16:30:00.000Z'),
    businessDate: LocalDate.parse('2026-10-03'),
    amount: { value: '25.90', currency: null },
    merchant: 'Tambo',
    cardLast4: null,
    description: null,
    categoryId: null,
    paymentMethodId: null,
    warnings: [],
    rawPayload: { source: 'IOS_SHORTCUT', amountText: '25.90' },
    idempotencyKey: `clave-${String(keys)}`,
    ...extra,
  };
}

describe('the inbox', () => {
  let captures: FakeCaptureRepository;
  let catalog: FakeCaptureCatalogReader;
  let clock: FixedClock;

  beforeEach(() => {
    captures = new FakeCaptureRepository();
    catalog = new FakeCaptureCatalogReader();
    clock = FixedClock.at(NOW);
    catalog.categories.push(
      { userId: ANA, category: { id: 'viveres', type: 'VARIABLE_EXPENSE', archived: false } },
      { userId: ANA, category: { id: 'honorarios', type: 'INCOME', archived: false } },
      { userId: ANA, category: { id: 'vieja', type: 'VARIABLE_EXPENSE', archived: true } },
      { userId: BRUNO, category: { id: 'de-bruno', type: 'VARIABLE_EXPENSE', archived: false } },
    );
    catalog.paymentMethods.push(
      {
        userId: ANA,
        method: { id: 'visa', alias: 'Visa', last4: '4242', currency: 'PEN', archived: false },
      },
      {
        userId: ANA,
        method: { id: 'cancelada', alias: 'Vieja', last4: null, currency: null, archived: true },
      },
    );
  });

  describe('ListCaptures', () => {
    it('lists the inbox, newest first, with the duplicates and without the rest', async () => {
      const older = await captures.create(ANA, capture());
      const newer = await captures.create(
        ANA,
        capture({ status: 'DUPLICATE', occurredAt: new Date('2026-10-03T18:00:00.000Z') }),
      );
      await captures.create(ANA, capture({ status: 'CONFIRMED' }));
      await captures.create(BRUNO, capture());

      const page = await new ListCaptures(captures).execute(ANA, {
        status: 'inbox',
        after: null,
        limit: 50,
      });

      expect(page.captures.map(({ id }) => id)).toEqual([newer.id, older.id]);
      expect(page.next).toBeNull();
    });

    it('pages with the position of the last one', async () => {
      for (let hour = 10; hour < 15; hour++) {
        await captures.create(
          ANA,
          capture({ occurredAt: new Date(`2026-10-03T${String(hour)}:00:00.000Z`) }),
        );
      }
      const list = new ListCaptures(captures);

      const first = await list.execute(ANA, { status: 'inbox', after: null, limit: 3 });
      const second = await list.execute(ANA, { status: 'inbox', after: first.next, limit: 3 });

      expect(first.captures).toHaveLength(3);
      expect(first.next).toEqual({
        occurredAt: new Date('2026-10-03T12:00:00.000Z'),
        id: first.captures[2]?.id,
      });
      expect(second.captures.map(({ occurredAt }) => occurredAt.getUTCHours())).toEqual([11, 10]);
      expect(second.next).toBeNull();
    });

    it('lists the discarded ones on their own', async () => {
      await captures.create(ANA, capture());
      const discarded = await captures.create(ANA, capture());
      await new DiscardCapture(captures, clock).execute(ANA, discarded.id);

      const page = await new ListCaptures(captures).execute(ANA, {
        status: 'discarded',
        after: null,
        limit: 50,
      });

      expect(page.captures.map(({ id }) => id)).toEqual([discarded.id]);
    });
  });

  describe('GetCapture', () => {
    it('gives a capture of the account, with its raw request', async () => {
      const created = await captures.create(ANA, capture());

      await expect(new GetCapture(captures).execute(ANA, created.id)).resolves.toMatchObject({
        id: created.id,
        rawPayload: { source: 'IOS_SHORTCUT', amountText: '25.90' },
      });
    });

    it('does not give the capture of another account', async () => {
      const theirs = await captures.create(BRUNO, capture());

      await expect(new GetCapture(captures).execute(ANA, theirs.id)).rejects.toBeInstanceOf(
        CaptureNotFoundError,
      );
    });
  });

  describe('CorrectCapture (decision 10)', () => {
    let correct: CorrectCapture;

    beforeEach(() => {
      correct = new CorrectCapture(captures, catalog, clock);
    });

    it('corrects every field', async () => {
      const created = await captures.create(ANA, capture());

      const corrected = await correct.execute(ANA, created.id, {
        type: 'INCOME',
        date: LocalDate.parse('2026-10-02'),
        amount: '30.00',
        currency: 'USD',
        categoryId: 'honorarios',
        paymentMethodId: 'visa',
        merchant: 'Cliente',
        description: 'Pago',
      });

      expect(corrected).toMatchObject({
        type: 'INCOME',
        amount: { value: '30.00', currency: 'USD' },
        categoryId: 'honorarios',
        paymentMethodId: 'visa',
        merchant: 'Cliente',
        description: 'Pago',
        status: 'PENDING',
      });
      expect(corrected.businessDate.toString()).toBe('2026-10-02');
    });

    it('keeps the duplicate mark: it says how it arrived', async () => {
      const created = await captures.create(ANA, capture({ status: 'DUPLICATE' }));

      await expect(
        correct.execute(ANA, created.id, { description: 'Almuerzo' }),
      ).resolves.toMatchObject({ status: 'DUPLICATE', description: 'Almuerzo' });
    });

    it('takes the currency of the chosen method when the amount has none (decision 3)', async () => {
      const created = await captures.create(ANA, capture());

      await expect(
        correct.execute(ANA, created.id, { paymentMethodId: 'visa' }),
      ).resolves.toMatchObject({ amount: { value: '25.90', currency: 'PEN' } });
    });

    it('clears the category when the type changes without one', async () => {
      const created = await captures.create(ANA, capture({ categoryId: 'viveres' }));

      await expect(correct.execute(ANA, created.id, { type: 'INCOME' })).resolves.toMatchObject({
        categoryId: null,
      });
    });

    it('refuses a category of another type', async () => {
      const created = await captures.create(ANA, capture());

      await expect(
        correct.execute(ANA, created.id, { categoryId: 'honorarios' }),
      ).rejects.toBeInstanceOf(CategoryTypeMismatchError);
    });

    it('checks the category it keeps when the type changes with it', async () => {
      const created = await captures.create(ANA, capture({ categoryId: 'viveres' }));

      await expect(
        correct.execute(ANA, created.id, { type: 'INCOME', categoryId: 'viveres' }),
      ).rejects.toBeInstanceOf(CategoryTypeMismatchError);
    });

    it.each([
      ['an archived category', { categoryId: 'vieja' }, ArchivedCategoryError],
      ['the category of another account', { categoryId: 'de-bruno' }, CaptureCategoryNotFoundError],
      ['an archived method', { paymentMethodId: 'cancelada' }, ArchivedPaymentMethodError],
      [
        'a method that does not exist',
        { paymentMethodId: 'otra' },
        CapturePaymentMethodNotFoundError,
      ],
      ['a future date', { date: LocalDate.parse('2026-10-05') }, FutureTransactionDateError],
    ])('refuses %s', async (_label, changes, error) => {
      const created = await captures.create(ANA, capture());

      await expect(correct.execute(ANA, created.id, changes)).rejects.toBeInstanceOf(error);
    });

    it('lets the category and the method be cleared', async () => {
      const created = await captures.create(
        ANA,
        capture({ categoryId: 'viveres', paymentMethodId: 'cancelada' }),
      );

      await expect(
        correct.execute(ANA, created.id, { categoryId: null, paymentMethodId: null }),
      ).resolves.toMatchObject({ categoryId: null, paymentMethodId: null });
    });

    it('does not check again a category or method that did not change', async () => {
      const created = await captures.create(ANA, capture({ paymentMethodId: 'cancelada' }));

      await expect(correct.execute(ANA, created.id, { merchant: 'Wong' })).resolves.toMatchObject({
        merchant: 'Wong',
        paymentMethodId: 'cancelada',
      });
    });

    it.each(['CONFIRMED', 'DISCARDED'] as const)('refuses a %s capture', async (status) => {
      const created = await captures.create(ANA, capture({ status }));

      await expect(correct.execute(ANA, created.id, { merchant: 'Wong' })).rejects.toBeInstanceOf(
        CaptureNotPendingError,
      );
    });

    it('does not touch the capture of another account', async () => {
      const theirs = await captures.create(BRUNO, capture());

      await expect(correct.execute(ANA, theirs.id, { merchant: 'Wong' })).rejects.toBeInstanceOf(
        CaptureNotFoundError,
      );
    });

    it('refuses the change when another request confirmed it in between', async () => {
      const created = await captures.create(ANA, capture());
      captures.update = () => Promise.resolve(null);

      await expect(correct.execute(ANA, created.id, { merchant: 'Wong' })).rejects.toBeInstanceOf(
        CaptureNotPendingError,
      );
    });
  });

  describe('DiscardCapture and RestoreCapture (decision 11)', () => {
    it('discards a duplicate and takes it back as a duplicate', async () => {
      const created = await captures.create(ANA, capture({ status: 'DUPLICATE' }));

      const discarded = await new DiscardCapture(captures, clock).execute(ANA, created.id);
      const restored = await new RestoreCapture(captures).execute(ANA, created.id);

      expect(discarded).toMatchObject({
        status: 'DISCARDED',
        discardedAt: NOW,
        discardedFrom: 'DUPLICATE',
      });
      expect(restored).toMatchObject({
        status: 'DUPLICATE',
        discardedAt: null,
        discardedFrom: null,
      });
    });

    it('refuses to discard a confirmed capture', async () => {
      const created = await captures.create(ANA, capture({ status: 'CONFIRMED' }));

      await expect(
        new DiscardCapture(captures, clock).execute(ANA, created.id),
      ).rejects.toBeInstanceOf(CaptureNotPendingError);
    });

    it('refuses to restore a capture that is not discarded', async () => {
      const created = await captures.create(ANA, capture());

      await expect(new RestoreCapture(captures).execute(ANA, created.id)).rejects.toBeInstanceOf(
        CaptureNotDiscardedError,
      );
    });

    it('does not touch the capture of another account', async () => {
      const theirs = await captures.create(BRUNO, capture());

      await expect(
        new DiscardCapture(captures, clock).execute(ANA, theirs.id),
      ).rejects.toBeInstanceOf(CaptureNotFoundError);
      await expect(new RestoreCapture(captures).execute(ANA, theirs.id)).rejects.toBeInstanceOf(
        CaptureNotFoundError,
      );
    });

    it.each([
      ['discard', 'PENDING'],
      ['restore', 'DISCARDED'],
    ] as const)(
      'refuses to %s when another request changed it in between',
      async (action, status) => {
        const created = await captures.create(ANA, capture({ status }));
        captures.update = () => Promise.resolve(null);

        const run =
          action === 'discard'
            ? new DiscardCapture(captures, clock).execute(ANA, created.id)
            : new RestoreCapture(captures).execute(ANA, created.id);

        await expect(run).rejects.toThrow(
          action === 'discard' ? CaptureNotPendingError : CaptureNotDiscardedError,
        );
      },
    );
  });

  describe('PurgeDiscardedCaptures (decision 11)', () => {
    const accounts = { execute: () => Promise.resolve([ANA, BRUNO]) };

    async function discardedAt(userId: string, at: string) {
      const created = await captures.create(userId, capture());
      await new DiscardCapture(captures, FixedClock.at(new Date(at))).execute(userId, created.id);
      return created;
    }

    it('deletes for good the captures discarded more than 90 days ago, in every account', async () => {
      await discardedAt(ANA, '2026-07-01T00:00:00.000Z');
      await discardedAt(BRUNO, '2026-07-05T00:00:00.000Z');
      const recent = await discardedAt(ANA, '2026-07-07T00:00:00.000Z');
      const pending = await captures.create(ANA, capture());
      const flags = { isEnabled: () => true };

      await expect(
        new PurgeDiscardedCaptures(captures, accounts, flags, clock).execute(),
      ).resolves.toBe(2);

      expect(captures.stored.map(({ capture: { id } }) => id).toSorted()).toEqual(
        [recent.id, pending.id].toSorted(),
      );
    });

    it('does nothing while the capture module is off', async () => {
      await discardedAt(ANA, '2026-01-01T00:00:00.000Z');
      const flags = { isEnabled: () => false };

      await expect(
        new PurgeDiscardedCaptures(captures, accounts, flags, clock).execute(),
      ).resolves.toBe(0);
      expect(captures.stored).toHaveLength(1);
    });
  });
});
