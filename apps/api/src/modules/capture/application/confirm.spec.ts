import {
  CaptureAmountMissingError,
  CaptureCategoryMissingError,
  CaptureNotPendingError,
  FixedClock,
  FutureTransactionDateError,
  LocalDate,
  Money,
} from '@sol-a-sol/domain';
import { beforeEach, describe, expect, it } from 'vitest';

import { CaptureMerchantMissingError, CaptureNotFoundError } from '../domain/errors.js';
import type { NewCapture } from '../ports/capture-repository.js';
import { FakeCaptureRepository } from '../ports/capture-repository.fake.js';
import { FakeCategorizationRuleRepository } from '../ports/categorization-rule-repository.fake.js';
import { FakeCaptureTransactionsWriter } from '../ports/transactions-writer.fake.js';
import { ConfirmCapture, ConfirmCaptures } from './confirm.js';

const ANA = 'user-ana';
const BRUNO = 'user-bruno';
// 4 de octubre de 2026, 10:00 en Lima.
const NOW = new Date('2026-10-04T15:00:00.000Z');

let keys = 0;

/** Una captura completa: con monto, moneda, categoría y comercio. */
function complete(extra: Partial<NewCapture> = {}): NewCapture {
  keys += 1;
  return {
    source: 'ANDROID_AUTOMATION',
    status: 'PENDING',
    type: 'VARIABLE_EXPENSE',
    occurredAt: new Date('2026-10-03T16:30:00.000Z'),
    businessDate: LocalDate.parse('2026-10-03'),
    amount: { value: '25.90', currency: 'PEN' },
    merchant: 'Tambo Larcó',
    cardLast4: null,
    description: null,
    categoryId: 'viveres',
    paymentMethodId: 'visa',
    warnings: [],
    rawPayload: { source: 'ANDROID_AUTOMATION', rawText: 'Compra en TAMBO' },
    idempotencyKey: `clave-${String(keys)}`,
    ...extra,
  };
}

describe('confirming captures', () => {
  let captures: FakeCaptureRepository;
  let rules: FakeCategorizationRuleRepository;
  let writer: FakeCaptureTransactionsWriter;
  let confirm: ConfirmCapture;

  beforeEach(() => {
    captures = new FakeCaptureRepository();
    rules = new FakeCategorizationRuleRepository();
    writer = new FakeCaptureTransactionsWriter();
    confirm = new ConfirmCapture(captures, rules, writer, FixedClock.at(NOW));
  });

  describe('ConfirmCapture', () => {
    it('records its transaction and marks it confirmed, without its raw request', async () => {
      const created = await captures.create(ANA, complete());

      const confirmed = await confirm.execute(ANA, created.id, { rememberCategory: false });

      expect(writer.recorded).toEqual([
        {
          userId: ANA,
          transactionId: 'transaction-1',
          draft: {
            captureId: created.id,
            date: LocalDate.parse('2026-10-03'),
            type: 'VARIABLE_EXPENSE',
            categoryId: 'viveres',
            amount: expect.objectContaining({ currency: 'PEN' }) as unknown,
            paymentMethodId: 'visa',
            merchant: 'Tambo Larcó',
            // Sin descripción, el comercio (decidido el 2026-10-04).
            description: 'Tambo Larcó',
            source: 'ANDROID_AUTOMATION',
          },
        },
      ]);
      expect(writer.recorded[0]?.draft.amount.toFixed()).toBe('25.90');
      expect(confirmed).toMatchObject({ status: 'CONFIRMED', transactionId: 'transaction-1' });
      expect(rules.rules).toEqual([]);
    });

    it('confirms a duplicate (decision 6)', async () => {
      const created = await captures.create(ANA, complete({ status: 'DUPLICATE' }));

      await expect(
        confirm.execute(ANA, created.id, { rememberCategory: false }),
      ).resolves.toMatchObject({ status: 'CONFIRMED' });
    });

    it('answers a second confirmation without recording anything (decided 2026-10-04)', async () => {
      const created = await captures.create(ANA, complete());
      await confirm.execute(ANA, created.id, { rememberCategory: false });

      await expect(
        confirm.execute(ANA, created.id, { rememberCategory: false }),
      ).rejects.toBeInstanceOf(CaptureNotPendingError);
      expect(writer.recorded).toHaveLength(1);
    });

    // Otra pestaña confirmó entre la lectura y el cambio: la transacción es la misma (el
    // escritor no crea otra) y esta petición no se da por confirmada.
    it('loses the race against another confirmation without a second transaction', async () => {
      const created = await captures.create(ANA, complete());
      await writer.recordFromCapture(ANA, {
        captureId: created.id,
        date: LocalDate.parse('2026-10-03'),
        type: 'VARIABLE_EXPENSE',
        categoryId: 'viveres',
        amount: Money.of('25.90', 'PEN'),
        paymentMethodId: 'visa',
        merchant: 'Tambo Larcó',
        description: 'Tambo Larcó',
        source: 'ANDROID_AUTOMATION',
      });
      captures.update = () => Promise.resolve(null);

      await expect(
        confirm.execute(ANA, created.id, { rememberCategory: false }),
      ).rejects.toBeInstanceOf(CaptureNotPendingError);
      expect(writer.recorded).toHaveLength(1);
    });

    it('links the transaction a capture already had, if a confirmation was cut short', async () => {
      const created = await captures.create(ANA, complete());
      const first = await writer.recordFromCapture(ANA, {
        captureId: created.id,
        date: LocalDate.parse('2026-10-03'),
        type: 'VARIABLE_EXPENSE',
        categoryId: 'viveres',
        amount: Money.of('25.90', 'PEN'),
        paymentMethodId: 'visa',
        merchant: 'Tambo Larcó',
        description: 'Tambo Larcó',
        source: 'ANDROID_AUTOMATION',
      });

      await expect(
        confirm.execute(ANA, created.id, { rememberCategory: false }),
      ).resolves.toMatchObject({ status: 'CONFIRMED', transactionId: first.transactionId });
    });

    it.each([
      ['without an amount', { amount: null }, CaptureAmountMissingError],
      ['without a category', { categoryId: null }, CaptureCategoryMissingError],
      [
        'with a future date',
        { businessDate: LocalDate.parse('2026-10-05') },
        FutureTransactionDateError,
      ],
    ])('refuses a capture %s, recording nothing', async (_label, extra, error) => {
      const created = await captures.create(ANA, complete(extra));

      await expect(
        confirm.execute(ANA, created.id, { rememberCategory: false }),
      ).rejects.toBeInstanceOf(error);
      expect(writer.recorded).toEqual([]);
    });

    it('does not confirm the capture of another account', async () => {
      const theirs = await captures.create(BRUNO, complete());

      await expect(
        confirm.execute(ANA, theirs.id, { rememberCategory: false }),
      ).rejects.toBeInstanceOf(CaptureNotFoundError);
      expect(writer.recorded).toEqual([]);
    });

    it('lets an error of the transaction through, and leaves the capture pending', async () => {
      const created = await captures.create(ANA, complete());
      const failure = new Error('categoría archivada');
      writer.recordFromCapture = () => Promise.reject(failure);

      await expect(confirm.execute(ANA, created.id, { rememberCategory: false })).rejects.toBe(
        failure,
      );
      await expect(captures.find(ANA, created.id)).resolves.toMatchObject({ status: 'PENDING' });
    });

    describe('remembering the category for the merchant (decision 13)', () => {
      it('creates the rule for the merchant, without accents or case in its key', async () => {
        const created = await captures.create(ANA, complete());

        await confirm.execute(ANA, created.id, { rememberCategory: true });

        expect(rules.rules).toEqual([
          {
            userId: ANA,
            rule: {
              id: 'rule-1',
              pattern: 'Tambo Larcó',
              patternKey: 'tambo larco',
              categoryId: 'viveres',
              priority: 0,
            },
          },
        ]);
      });

      it('changes the category of the rule the merchant already had', async () => {
        rules.add(ANA, {
          id: 'regla',
          pattern: 'TAMBO LARCO',
          patternKey: 'tambo larco',
          categoryId: 'otra',
          priority: 4,
        });
        const created = await captures.create(ANA, complete());

        await confirm.execute(ANA, created.id, { rememberCategory: true });

        expect(rules.rules.map(({ rule }) => rule)).toEqual([
          {
            id: 'regla',
            pattern: 'TAMBO LARCO',
            patternKey: 'tambo larco',
            categoryId: 'viveres',
            priority: 4,
          },
        ]);
      });

      it('refuses to remember without a merchant, before recording anything', async () => {
        const created = await captures.create(
          ANA,
          complete({ merchant: null, description: 'Pago' }),
        );

        await expect(
          confirm.execute(ANA, created.id, { rememberCategory: true }),
        ).rejects.toBeInstanceOf(CaptureMerchantMissingError);
        expect(writer.recorded).toEqual([]);
      });
    });
  });

  describe('ConfirmCaptures (decision 10)', () => {
    it('confirms each one on its own and says why the others were not', async () => {
      const ready = await captures.create(ANA, complete());
      const missing = await captures.create(ANA, complete({ categoryId: null }));
      const remembered = await captures.create(ANA, complete({ merchant: 'Wong' }));
      const theirs = await captures.create(BRUNO, complete());

      const result = await new ConfirmCaptures(confirm).execute(ANA, [
        { id: ready.id, rememberCategory: false },
        { id: missing.id, rememberCategory: false },
        { id: theirs.id, rememberCategory: false },
        { id: remembered.id, rememberCategory: true },
        { id: ready.id, rememberCategory: false },
      ]);

      expect(result).toEqual({
        confirmed: [
          { id: ready.id, transactionId: 'transaction-1' },
          { id: remembered.id, transactionId: 'transaction-2' },
        ],
        failed: [
          { id: missing.id, code: 'CAPTURE_CATEGORY_MISSING' },
          { id: theirs.id, code: 'CAPTURE_NOT_FOUND' },
          { id: ready.id, code: 'CAPTURE_NOT_PENDING' },
        ],
      });
      expect(rules.rules.map(({ rule }) => rule.pattern)).toEqual(['Wong']);
    });

    it('stops at an unexpected error: it is not a reason to report, but a failure', async () => {
      const created = await captures.create(ANA, complete());
      const failure = new Error('la base se cayó');
      writer.recordFromCapture = () => Promise.reject(failure);

      await expect(
        new ConfirmCaptures(confirm).execute(ANA, [{ id: created.id, rememberCategory: false }]),
      ).rejects.toBe(failure);
    });
  });
});
