import {
  currencySchema,
  paymentMethodKindSchema,
  transactionSourceSchema,
  transactionTypeSchema,
} from '@sol-a-sol/contracts';
import {
  CURRENCIES,
  PAYMENT_METHOD_KINDS,
  TRANSACTION_SOURCES,
  TRANSACTION_TYPES,
} from '@sol-a-sol/domain';
import { describe, expect, it } from 'vitest';

/**
 * Los contratos listan los tipos y monedas para que OpenAPI los muestre, pero la fuente de
 * verdad es el dominio. Esta prueba vive en la API, que ve los dos paquetes: si un día se agrega
 * un valor en uno solo, falla aquí y no en producción.
 */
describe('contracts and domain', () => {
  it('agree on the payment method kinds', () => {
    expect(paymentMethodKindSchema.options).toEqual([...PAYMENT_METHOD_KINDS]);
  });

  it('agree on the transaction types, which also classify the categories', () => {
    expect(transactionTypeSchema.options).toEqual([...TRANSACTION_TYPES]);
  });

  it('agree on where a transaction came from', () => {
    expect(transactionSourceSchema.options).toEqual([...TRANSACTION_SOURCES]);
  });

  it('agree on the currencies', () => {
    expect(currencySchema.options).toEqual([...CURRENCIES]);
  });
});
