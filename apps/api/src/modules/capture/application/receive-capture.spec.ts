import { FixedClock, LocalDate, Money } from '@sol-a-sol/domain';
import { beforeEach, describe, expect, it } from 'vitest';

import { IdempotencyKeyTakenError } from '../ports/capture-repository.js';
import { FakeCaptureRepository } from '../ports/capture-repository.fake.js';
import { FakeCaptureCatalogReader } from '../ports/catalog-reader.fake.js';
import { FakeCategorizationRuleRepository } from '../ports/categorization-rule-repository.fake.js';
import { FakeCaptureTransactionsReader } from '../ports/transactions-reader.fake.js';
import { type CaptureRequestBody, ReceiveCapture } from './receive-capture.js';

const ANA = 'user-ana';
const BRUNO = 'user-bruno';
// 3 de octubre de 2026, 12:00 en Lima.
const NOW = new Date('2026-10-03T17:00:00.000Z');

const SHORTCUT: CaptureRequestBody = {
  source: 'IOS_SHORTCUT',
  occurredAt: '2026-10-03T11:30:00-05:00',
  amountText: '25.90',
  merchant: 'Tambo Larco',
  card: 'Visa BCP',
};

const AUTOMATION: CaptureRequestBody = {
  source: 'ANDROID_AUTOMATION',
  occurredAt: '2026-10-03T11:30:00-05:00',
  rawText: 'Compra por S/ 12.50 en TIENDA EJEMPLO',
};

describe('ReceiveCapture', () => {
  let captures: FakeCaptureRepository;
  let rules: FakeCategorizationRuleRepository;
  let catalog: FakeCaptureCatalogReader;
  let transactions: FakeCaptureTransactionsReader;
  let receive: ReceiveCapture;

  beforeEach(() => {
    captures = new FakeCaptureRepository();
    rules = new FakeCategorizationRuleRepository();
    catalog = new FakeCaptureCatalogReader();
    transactions = new FakeCaptureTransactionsReader();
    receive = new ReceiveCapture(captures, rules, catalog, transactions, FixedClock.at(NOW));
    catalog.paymentMethods.push({
      userId: ANA,
      method: { id: 'visa', alias: 'Visa BCP', last4: '4242', currency: 'PEN', archived: false },
    });
    catalog.categories.push({
      userId: ANA,
      category: { id: 'viveres', type: 'VARIABLE_EXPENSE', archived: false },
    });
    rules.add(ANA, {
      id: 'regla',
      pattern: 'Tambo',
      patternKey: 'tambo',
      categoryId: 'viveres',
      priority: 0,
    });
  });

  it('saves what the shortcut sent, with its method, currency and category', async () => {
    const { capture, created } = await receive.execute(ANA, SHORTCUT);

    expect(created).toBe(true);
    expect(capture).toMatchObject({
      source: 'IOS_SHORTCUT',
      status: 'PENDING',
      type: 'VARIABLE_EXPENSE',
      occurredAt: new Date('2026-10-03T16:30:00.000Z'),
      // La moneda, del método de pago, que tiene una sola (decisión 3).
      amount: { value: '25.90', currency: 'PEN' },
      merchant: 'Tambo Larco',
      paymentMethodId: 'visa',
      categoryId: 'viveres',
      description: null,
      warnings: [],
    });
    expect(capture.businessDate.toString()).toBe('2026-10-03');
  });

  it('keeps the request as it arrived', async () => {
    await receive.execute(ANA, { ...SHORTCUT, rawText: '' });

    expect(captures.stored[0]?.capture.rawPayload).toEqual({
      source: 'IOS_SHORTCUT',
      occurredAt: '2026-10-03T11:30:00-05:00',
      amountText: '25.90',
      merchant: 'Tambo Larco',
      card: 'Visa BCP',
    });
  });

  it('reads the text of the notification', async () => {
    const { capture } = await receive.execute(ANA, AUTOMATION);

    expect(capture).toMatchObject({
      source: 'ANDROID_AUTOMATION',
      amount: { value: '12.50', currency: 'PEN' },
      warnings: ['UNKNOWN_SOURCE'],
    });
    expect(captures.stored[0]?.capture.rawPayload?.rawText).toBe(AUTOMATION.rawText);
  });

  it('saves a capture it does not understand at all, with its warnings', async () => {
    const { capture, created } = await receive.execute(ANA, {
      source: 'ANDROID_AUTOMATION',
      occurredAt: '2026-10-03T11:30:00-05:00',
      rawText: 'Tienes una notificación nueva',
    });

    expect(created).toBe(true);
    expect(capture).toMatchObject({
      status: 'PENDING',
      amount: null,
      merchant: null,
      warnings: ['UNKNOWN_SOURCE', 'AMOUNT_NOT_FOUND'],
    });
  });

  it('saves a capture with nothing but its source and instant', async () => {
    const { capture } = await receive.execute(ANA, {
      source: 'IOS_SHORTCUT',
      occurredAt: '2026-10-03T11:30:00-05:00',
    });

    expect(capture).toMatchObject({ amount: null, paymentMethodId: null, warnings: [] });
  });

  it('never stores a full card number, in any field (rule 6)', async () => {
    const { capture } = await receive.execute(ANA, {
      ...SHORTCUT,
      card: '4111 1111 1111 4242',
      rawText: 'Compra con 4111111111114242',
    });

    expect(JSON.stringify(captures.stored[0]?.capture.rawPayload)).not.toMatch(/\d{13}|4111 1111/u);
    expect(captures.stored[0]?.capture.rawPayload?.card).toBe('••••4242');
    expect(capture.cardLast4).toBe('4242');
    expect(capture.paymentMethodId).toBe('visa');
    expect(capture.warnings).toContain('CARD_NUMBER_MASKED');
  });

  it('warns once when a card number came in a field and not in the text', async () => {
    const { capture } = await receive.execute(ANA, { ...SHORTCUT, card: '4111111111114242' });

    expect(capture.warnings).toEqual(['CARD_NUMBER_MASKED']);
  });

  it('keeps a future day as today, with a warning (decision 5)', async () => {
    const { capture } = await receive.execute(ANA, {
      ...SHORTCUT,
      occurredAt: '2026-10-04T09:00:00-05:00',
    });

    expect(capture.businessDate.toString()).toBe('2026-10-03');
    expect(capture.warnings).toEqual(['FUTURE_DATE']);
  });

  describe('idempotency (decision 7)', () => {
    it('answers a retry with the same key with the capture it already saved', async () => {
      const first = await receive.execute(ANA, SHORTCUT, 'reintento-1');

      const second = await receive.execute(
        ANA,
        { ...SHORTCUT, amountText: '99.00' },
        'reintento-1',
      );

      expect(second).toEqual({ capture: first.capture, created: false });
      expect(captures.stored).toHaveLength(1);
    });

    it('builds the key from the whole request when there is none', async () => {
      const first = await receive.execute(ANA, AUTOMATION);
      const retry = await receive.execute(ANA, { ...AUTOMATION });

      expect(retry).toEqual({ capture: first.capture, created: false });
      expect(captures.stored[0]?.idempotencyKey).toMatch(/^auto:[0-9a-f]{64}$/u);
    });

    it('reads the same instant written in another zone as the same request', async () => {
      await receive.execute(ANA, AUTOMATION);

      const retry = await receive.execute(ANA, {
        ...AUTOMATION,
        occurredAt: '2026-10-03T16:30:00Z',
      });

      expect(retry.created).toBe(false);
    });

    it('does not mix up two notifications of the same instant that say different things', async () => {
      await receive.execute(ANA, { ...AUTOMATION, rawText: 'Notificación uno' });

      const other = await receive.execute(ANA, { ...AUTOMATION, rawText: 'Notificación dos' });

      expect(other.created).toBe(true);
      expect(captures.stored).toHaveLength(2);
    });

    it('lets another account use the same key', async () => {
      await receive.execute(ANA, SHORTCUT, 'la-misma');

      await expect(receive.execute(BRUNO, SHORTCUT, 'la-misma')).resolves.toMatchObject({
        created: true,
      });
    });

    it('answers with the saved capture when another retry saved it first', async () => {
      const saved = await receive.execute(ANA, SHORTCUT, 'a-la-vez');
      // La otra petición guardó entre la búsqueda y el guardado de esta.
      captures.findByIdempotencyKey = (() => {
        let calls = 0;
        const original = FakeCaptureRepository.prototype.findByIdempotencyKey.bind(captures);
        return (userId: string, key: string) =>
          calls++ === 0 ? Promise.resolve(null) : original(userId, key);
      })();

      await expect(receive.execute(ANA, SHORTCUT, 'a-la-vez')).resolves.toEqual({
        capture: saved.capture,
        created: false,
      });
    });

    it('lets any other error of the repository through', async () => {
      const failure = new Error('la base se cayó');
      captures.create = () => Promise.reject(failure);

      await expect(receive.execute(ANA, SHORTCUT)).rejects.toBe(failure);
    });

    it('lets the conflict through if the capture that won cannot be found', async () => {
      captures.create = () => Promise.reject(new IdempotencyKeyTakenError());

      await expect(receive.execute(ANA, SHORTCUT)).rejects.toBeInstanceOf(IdempotencyKeyTakenError);
    });
  });

  describe('duplicates (decision 6)', () => {
    it('marks a capture with the same amount and merchant a minute later', async () => {
      const first = await receive.execute(ANA, SHORTCUT);

      const { capture } = await receive.execute(ANA, {
        ...SHORTCUT,
        occurredAt: '2026-10-03T11:31:00-05:00',
      });

      expect(capture.status).toBe('DUPLICATE');
      expect(first.capture.status).toBe('PENDING');
    });

    it('does not mark one three minutes later', async () => {
      await receive.execute(ANA, SHORTCUT);

      const { capture } = await receive.execute(ANA, {
        ...SHORTCUT,
        occurredAt: '2026-10-03T11:33:00-05:00',
      });

      expect(capture.status).toBe('PENDING');
    });

    it('marks a capture already registered by hand that day', async () => {
      transactions.transactions.push({
        userId: ANA,
        transaction: {
          id: 'a-mano',
          date: LocalDate.parse('2026-10-03'),
          amount: Money.of('25.90', 'PEN'),
          merchant: 'TAMBO LARCO',
          description: 'Almuerzo',
        },
      });

      await expect(receive.execute(ANA, SHORTCUT)).resolves.toMatchObject({
        capture: { status: 'DUPLICATE' },
      });
    });

    it('does not compare with the captures or transactions of another account', async () => {
      await receive.execute(BRUNO, SHORTCUT, 'de-bruno');
      transactions.transactions.push({
        userId: BRUNO,
        transaction: {
          id: 'de-bruno',
          date: LocalDate.parse('2026-10-03'),
          amount: Money.of('25.90', 'PEN'),
          merchant: 'Tambo Larco',
          description: 'Almuerzo',
        },
      });

      await expect(receive.execute(ANA, SHORTCUT)).resolves.toMatchObject({
        capture: { status: 'PENDING' },
      });
    });
  });

  it('uses only the methods, categories and rules of the account', async () => {
    const { capture } = await receive.execute(BRUNO, SHORTCUT);

    expect(capture).toMatchObject({
      paymentMethodId: null,
      categoryId: null,
      amount: { value: '25.90', currency: null },
    });
  });

  it('skips a rule whose category is gone', async () => {
    rules.add(ANA, {
      id: 'huerfana',
      pattern: 'Larco',
      patternKey: 'larco',
      categoryId: 'no-existe',
      priority: 9,
    });

    await expect(receive.execute(ANA, SHORTCUT)).resolves.toMatchObject({
      capture: { categoryId: 'viveres' },
    });
  });

  // «Siempre guarda» (plan, 8.1): un fallo al buscar método, regla o duplicados no la pierde.
  it('still saves the capture when matching it fails, with a warning', async () => {
    catalog.allPaymentMethods = () => Promise.reject(new Error('catalog caído'));

    const { capture, created } = await receive.execute(ANA, SHORTCUT);

    expect(created).toBe(true);
    expect(capture).toMatchObject({
      amount: { value: '25.90', currency: null },
      paymentMethodId: null,
      categoryId: null,
      status: 'PENDING',
      warnings: ['PROCESSING_FAILED'],
    });
  });
});
