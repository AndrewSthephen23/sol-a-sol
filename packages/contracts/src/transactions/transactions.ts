import { z } from 'zod';

import { transactionTypeSchema } from '../catalog/categories.js';
import { currencySchema } from '../catalog/payment-methods.js';

/** Topes defensivos, no reglas de negocio. */
export const TRANSACTION_DESCRIPTION_MAX_LENGTH = 200;
export const MERCHANT_MAX_LENGTH = 80;

/**
 * Hasta 16 cifras enteras: lo que cabe en `NUMERIC(18,2)`. Más sería un 500 de la base, no un
 * gasto de verdad.
 */
export const AMOUNT_MAX_INTEGER_DIGITS = 16;

/** De dónde llegó una transacción. Una prueba de la API comprueba que coincidan con el dominio. */
export const transactionSourceSchema = z.enum([
  'MANUAL',
  'IOS_SHORTCUT',
  'ANDROID_AUTOMATION',
  'IMPORT',
]);

/**
 * Un monto viaja como **string decimal** (`"25.90"`), nunca como número: un `number` en JSON ya
 * perdió precisión antes de llegar.
 *
 * Solo la forma: admite el signo y cualquier cantidad de decimales **a propósito**, para que el
 * dominio rechace un negativo (`TRANSACTION_AMOUNT_NOT_POSITIVE`) o un tercer decimal
 * (`INVALID_AMOUNT`) diciendo qué regla se rompió, en vez de un error genérico de forma.
 */
export const decimalAmountSchema = z
  .string()
  .regex(new RegExp(`^-?\\d{1,${String(AMOUNT_MAX_INTEGER_DIGITS)}}(?:\\.\\d+)?$`, 'u'), {
    message: 'Expected a decimal string such as "25.90".',
  });

const description = z.string().trim().min(1).max(TRANSACTION_DESCRIPTION_MAX_LENGTH);
/** Sin comercio se manda `null` o nada, no un texto vacío. */
const merchant = z.string().trim().min(1).max(MERCHANT_MAX_LENGTH).nullable();

/**
 * Registra una transacción desde la web (`source: MANUAL`, que no se manda).
 *
 * Solo la forma. Que el monto sea positivo, la fecha no sea futura, la categoría sea del tipo y
 * esté activa, y de dónde sale la moneda si no se manda, lo decide `@sol-a-sol/domain`.
 *
 * **Estricto:** un campo desconocido se rechaza, y un `userId` o un `source` en el cuerpo no se
 * ignoran en silencio.
 */
export const createTransactionRequestSchema = z.strictObject({
  /** Día en que pasó, `YYYY-MM-DD`, sin hora. */
  date: z.iso.date(),
  type: transactionTypeSchema,
  categoryId: z.uuid(),
  amount: decimalAmountSchema,
  /** Sin moneda, se usa la del método de pago; si este no tiene una, el dominio la exige. */
  currency: currencySchema.optional(),
  description,
  paymentMethodId: z.uuid().nullable().optional(),
  merchant: merchant.optional(),
});

export type CreateTransactionRequest = z.infer<typeof createTransactionRequestSchema>;
