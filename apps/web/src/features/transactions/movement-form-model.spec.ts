import { describe, expect, it } from 'vitest';

import type { CategoryInfo } from './labels';
import {
  checkTransaction,
  checkTransfer,
  type FormContext,
  formErrorFor,
  readTags,
  type TransactionValues,
  type TransferValues,
} from './movement-form-model';
import type { PaymentMethod } from './queries';

const STAMPS = { createdAt: '2026-09-28T15:00:00Z', updatedAt: '2026-09-28T15:00:00Z' };
const FOOD: CategoryInfo = {
  id: '11111111-1111-4111-8111-111111111111',
  name: 'Comida',
  type: 'VARIABLE_EXPENSE',
  parentId: null,
  color: '#f59e0b',
  icon: 'tag',
  archivedAt: null,
  ...STAMPS,
};

function method(id: string, alias: string, currency: 'PEN' | 'USD' | null): PaymentMethod {
  return {
    id,
    alias,
    kind: 'ACCOUNT',
    institution: null,
    last4: null,
    currency,
    archivedAt: null,
    ...STAMPS,
  };
}

const BCP = method('b', 'BCP', 'PEN');
const DOLLARS = method('d', 'BCP Dólares', 'USD');
const WALLET = method('w', 'Billetera', null);

const CONTEXT: FormContext = {
  categories: new Map([[FOOD.id, FOOD]]),
  paymentMethods: new Map([BCP, DOLLARS, WALLET].map((m) => [m.id, m])),
  today: '2026-09-28',
};

const TRANSACTION: TransactionValues = {
  date: '2026-09-28',
  categoryId: FOOD.id,
  amount: '25.9',
  currency: null,
  paymentMethodId: BCP.id,
  description: '',
  merchant: '',
  tags: '',
};

describe('checkTransaction', () => {
  it('builds the body, with the type of the category and the currency of the method', () => {
    expect(checkTransaction(TRANSACTION, CONTEXT)).toEqual({
      body: {
        date: '2026-09-28',
        type: 'VARIABLE_EXPENSE',
        categoryId: FOOD.id,
        amount: '25.90',
        currency: 'PEN',
        description: 'Comida',
        paymentMethodId: BCP.id,
        merchant: null,
        tags: [],
      },
    });
  });

  it('keeps what was written in the folded fields', () => {
    const checked = checkTransaction(
      { ...TRANSACTION, description: ' Almuerzo ', merchant: ' Tambo ', tags: 'viaje, trabajo' },
      CONTEXT,
    );

    expect(checked).toMatchObject({
      body: { description: 'Almuerzo', merchant: 'Tambo', tags: ['viaje', 'trabajo'] },
    });
  });

  it('asks for the currency without a method, or with one that takes both', () => {
    for (const paymentMethodId of [null, WALLET.id]) {
      expect(checkTransaction({ ...TRANSACTION, paymentMethodId }, CONTEXT)).toEqual({
        errors: { currency: 'Elige la moneda.' },
      });
    }
    expect(
      checkTransaction({ ...TRANSACTION, paymentMethodId: null, currency: 'USD' }, CONTEXT),
    ).toMatchObject({ body: { currency: 'USD', paymentMethodId: null } });
  });

  it('reports every field that is wrong at once', () => {
    expect(
      checkTransaction(
        { ...TRANSACTION, categoryId: '', amount: '', date: '2026-09-29', tags: 'a|b' },
        CONTEXT,
      ),
    ).toEqual({
      errors: {
        categoryId: 'Elige una categoría.',
        amount: 'Escribe el monto.',
        date: 'La fecha no puede ser futura: se registra lo que ya pasó.',
        tags: 'Una etiqueta no puede llevar «|».',
      },
    });
  });

  it('asks for a date', () => {
    expect(checkTransaction({ ...TRANSACTION, date: '' }, CONTEXT)).toEqual({
      errors: { date: 'Elige la fecha.' },
    });
  });
});

describe('readTags', () => {
  it('splits by commas and drops blanks and repeats, ignoring case and accents', () => {
    expect(readTags(' viaje, ,Viaje, cafe, Café ,trabajo')).toEqual({
      tags: ['viaje', 'cafe', 'trabajo'],
    });
  });

  it('allows up to 10 different tags', () => {
    const ten = Array.from({ length: 10 }, (_, index) => `t${String(index)}`).join(',');

    expect(readTags(ten)).toEqual({ tags: ten.split(',') });
    expect(readTags(`${ten},otra`)).toEqual({ error: 'Hasta 10 etiquetas por movimiento.' });
  });

  it('rejects a tag longer than 40 characters', () => {
    expect(readTags('x'.repeat(41))).toEqual({
      error: 'Cada etiqueta puede tener hasta 40 caracteres.',
    });
  });
});

const TRANSFER: TransferValues = {
  date: '2026-09-28',
  fromPaymentMethodId: BCP.id,
  toPaymentMethodId: WALLET.id,
  amount: '100',
  currency: null,
  receivedAmount: '',
  description: '',
};

describe('checkTransfer', () => {
  it('builds the body in one currency, proposing a description', () => {
    expect(checkTransfer(TRANSFER, CONTEXT)).toEqual({
      body: {
        date: '2026-09-28',
        fromPaymentMethodId: BCP.id,
        toPaymentMethodId: WALLET.id,
        amount: '100.00',
        currency: 'PEN',
        receivedAmount: '100.00',
        receivedCurrency: 'PEN',
        description: 'Transferencia BCP → Billetera',
      },
    });
  });

  it('asks for what arrived when the currency changes, and never converts', () => {
    const toDollars = { ...TRANSFER, toPaymentMethodId: DOLLARS.id, description: 'Cambio' };

    expect(checkTransfer(toDollars, CONTEXT)).toEqual({
      errors: { receivedAmount: 'Escribe cuánto llegó: la moneda cambia y nunca se convierte.' },
    });
    expect(checkTransfer({ ...toDollars, receivedAmount: '26.95' }, CONTEXT)).toMatchObject({
      body: { amount: '100.00', currency: 'PEN', receivedAmount: '26.95', receivedCurrency: 'USD' },
    });
    expect(checkTransfer({ ...toDollars, receivedAmount: '26.955' }, CONTEXT)).toEqual({
      errors: {
        receivedAmount: 'Escribe el monto con punto decimal y hasta 2 decimales, como 25.90.',
      },
    });
  });

  it('asks for the currency when the origin takes both', () => {
    const fromWallet = { ...TRANSFER, fromPaymentMethodId: WALLET.id, toPaymentMethodId: BCP.id };

    expect(checkTransfer(fromWallet, CONTEXT)).toEqual({
      errors: { currency: 'Elige la moneda.' },
    });
    expect(checkTransfer({ ...fromWallet, currency: 'PEN' }, CONTEXT)).toMatchObject({
      body: { currency: 'PEN', receivedCurrency: 'PEN' },
    });
  });

  it('needs two different accounts', () => {
    expect(
      checkTransfer({ ...TRANSFER, fromPaymentMethodId: '', toPaymentMethodId: '' }, CONTEXT),
    ).toEqual({
      errors: {
        fromPaymentMethodId: 'Elige la cuenta de origen.',
        toPaymentMethodId: 'Elige la cuenta de destino.',
      },
    });
    expect(checkTransfer({ ...TRANSFER, toPaymentMethodId: BCP.id }, CONTEXT)).toEqual({
      errors: { toPaymentMethodId: 'Elige una cuenta distinta a la de origen.' },
    });
  });

  it('refuses a future date', () => {
    expect(checkTransfer({ ...TRANSFER, date: '2026-10-01' }, CONTEXT)).toEqual({
      errors: { date: 'La fecha no puede ser futura: se registra lo que ya pasó.' },
    });
  });
});

describe('formErrorFor', () => {
  it('places a known API error on its field, in Spanish', () => {
    expect(formErrorFor('TRANSACTION_DATE_IN_FUTURE')).toEqual({
      field: 'date',
      message: 'La fecha no puede ser futura.',
    });
    expect(formErrorFor('TRANSFER_NOT_FOUND')).toEqual({
      message: 'Esta transferencia ya no existe.',
    });
  });

  it('knows nothing about other codes', () => {
    expect(formErrorFor('SOMETHING_NEW')).toBeNull();
    expect(formErrorFor(null)).toBeNull();
  });
});
