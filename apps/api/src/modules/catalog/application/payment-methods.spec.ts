import {
  FixedClock,
  InstitutionNotAllowedError,
  InvalidLast4Error,
  Last4RequiredError,
  PaymentMethodCurrencyRequiredError,
} from '@sol-a-sol/domain';
import { beforeEach, describe, expect, it } from 'vitest';

import { PaymentMethodAliasTakenError, PaymentMethodNotFoundError } from '../domain/errors.js';
import { FakePaymentMethodRepository } from '../ports/payment-method-repository.fake.js';
import { CreatePaymentMethod, ListPaymentMethods, UpdatePaymentMethod } from './payment-methods.js';

const ANA = 'user-ana';
const BRUNO = 'user-bruno';
const NOW = '2026-09-23T15:00:00.000Z';
const VISA = { kind: 'CREDIT_CARD', alias: 'Visa BCP', institution: 'BCP', last4: '4242' } as const;
const YAPE = { kind: 'WALLET', alias: 'Yape', currency: 'PEN' } as const;

describe('payment methods', () => {
  let methods: FakePaymentMethodRepository;
  let create: CreatePaymentMethod;
  let list: ListPaymentMethods;
  let update: UpdatePaymentMethod;

  beforeEach(() => {
    methods = new FakePaymentMethodRepository();
    create = new CreatePaymentMethod(methods);
    list = new ListPaymentMethods(methods);
    update = new UpdatePaymentMethod(methods, FixedClock.at(NOW));
  });

  describe('creating one', () => {
    it('keeps what was sent, with null for what was not', async () => {
      const created = await create.execute({ userId: ANA, ...VISA });

      expect(created).toMatchObject({
        kind: 'CREDIT_CARD',
        alias: 'Visa BCP',
        institution: 'BCP',
        last4: '4242',
        currency: null,
        archivedAt: null,
      });
    });

    it('applies the rules of the domain before saving anything', async () => {
      await expect(create.execute({ userId: ANA, ...VISA, last4: undefined })).rejects.toThrow(
        Last4RequiredError,
      );
      await expect(
        create.execute({ userId: ANA, ...VISA, last4: '4242424242424242' }),
      ).rejects.toThrow(InvalidLast4Error);
      await expect(create.execute({ userId: ANA, ...YAPE, currency: null })).rejects.toThrow(
        PaymentMethodCurrencyRequiredError,
      );
      expect(methods.rows).toHaveLength(0);
    });

    it('rejects an alias that is already taken, ignoring case', async () => {
      await create.execute({ userId: ANA, ...VISA });

      await expect(
        create.execute({ userId: ANA, ...VISA, alias: 'VISA bcp', last4: '0931' }),
      ).rejects.toThrow(PaymentMethodAliasTakenError);
    });

    it('lets another user use the same alias', async () => {
      await create.execute({ userId: ANA, ...VISA });

      await expect(create.execute({ userId: BRUNO, ...VISA })).resolves.toBeDefined();
    });
  });

  describe('listing', () => {
    it("shows only the user's own methods, without the archived ones", async () => {
      await create.execute({ userId: ANA, ...YAPE });
      const visa = await create.execute({ userId: ANA, ...VISA });
      await create.execute({ userId: BRUNO, kind: 'CASH', alias: 'Efectivo' });
      await update.execute({ userId: ANA, id: visa.id, changes: { archived: true } });

      const own = await list.execute({ userId: ANA, includeArchived: false });

      expect(own.map((method) => method.alias)).toEqual(['Yape']);
    });

    it('includes the archived ones when asked', async () => {
      await create.execute({ userId: ANA, ...YAPE });
      const visa = await create.execute({ userId: ANA, ...VISA });
      await update.execute({ userId: ANA, id: visa.id, changes: { archived: true } });

      const all = await list.execute({ userId: ANA, includeArchived: true });

      expect(all.map((method) => method.alias)).toEqual(['Visa BCP', 'Yape']);
    });
  });

  describe('updating', () => {
    it('changes only what was sent', async () => {
      const visa = await create.execute({ userId: ANA, ...VISA });

      const updated = await update.execute({
        userId: ANA,
        id: visa.id,
        changes: { alias: 'Visa Signature', currency: 'USD' },
      });

      expect(updated).toMatchObject({
        alias: 'Visa Signature',
        institution: 'BCP',
        last4: '4242',
        currency: 'USD',
      });
    });

    // Las reglas miran el resultado, no solo lo que cambió: quitarle el banco al efectivo vale,
    // pero dejar una tarjeta sin últimos 4 no.
    it('checks the rules on the method as it would end up', async () => {
      const visa = await create.execute({ userId: ANA, ...VISA });
      const cash = await create.execute({ userId: ANA, kind: 'CASH', alias: 'Efectivo' });

      await expect(
        update.execute({ userId: ANA, id: visa.id, changes: { last4: null } }),
      ).rejects.toThrow(Last4RequiredError);
      await expect(
        update.execute({ userId: ANA, id: cash.id, changes: { institution: 'BCP' } }),
      ).rejects.toThrow(InstitutionNotAllowedError);
      expect((await methods.find(ANA, visa.id))?.last4).toBe('4242');
    });

    it('archives with the current instant and restores by clearing it', async () => {
      const visa = await create.execute({ userId: ANA, ...VISA });

      const archived = await update.execute({
        userId: ANA,
        id: visa.id,
        changes: { archived: true },
      });
      const restored = await update.execute({
        userId: ANA,
        id: visa.id,
        changes: { archived: false },
      });

      expect(archived.archivedAt).toEqual(new Date(NOW));
      expect(restored.archivedAt).toBeNull();
    });

    // Archivar dos veces no mueve la fecha: sigue diciendo cuándo se archivó de verdad.
    it('keeps the original date when archiving an archived method again', async () => {
      const visa = await create.execute({ userId: ANA, ...VISA });
      await update.execute({ userId: ANA, id: visa.id, changes: { archived: true } });
      const later = new UpdatePaymentMethod(methods, FixedClock.at('2026-10-01T15:00:00.000Z'));

      const again = await later.execute({ userId: ANA, id: visa.id, changes: { archived: true } });

      expect(again.archivedAt).toEqual(new Date(NOW));
    });

    it('rejects an alias already taken by another method', async () => {
      await create.execute({ userId: ANA, ...YAPE });
      const visa = await create.execute({ userId: ANA, ...VISA });

      await expect(
        update.execute({ userId: ANA, id: visa.id, changes: { alias: 'yape' } }),
      ).rejects.toThrow(PaymentMethodAliasTakenError);
    });

    it("answers not found for another user's method, and leaves it untouched", async () => {
      const visa = await create.execute({ userId: ANA, ...VISA });

      await expect(
        update.execute({ userId: BRUNO, id: visa.id, changes: { archived: true } }),
      ).rejects.toThrow(PaymentMethodNotFoundError);
      expect((await methods.find(ANA, visa.id))?.archivedAt).toBeNull();
    });

    // Si otro proceso lo borra entre la lectura y la escritura, para quien llama no existe.
    it('answers not found when the method vanishes before the write', async () => {
      const visa = await create.execute({ userId: ANA, ...VISA });
      methods.update = () => Promise.resolve(null);

      await expect(
        update.execute({ userId: ANA, id: visa.id, changes: { alias: 'Otro' } }),
      ).rejects.toThrow(PaymentMethodNotFoundError);
    });

    it('answers not found for a method that does not exist', async () => {
      await expect(
        update.execute({ userId: ANA, id: 'no-existe', changes: { alias: 'Otro' } }),
      ).rejects.toThrow(PaymentMethodNotFoundError);
    });
  });
});
