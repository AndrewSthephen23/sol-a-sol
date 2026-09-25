import { z } from 'zod';

import { transactionTypeSchema } from '../catalog/categories.js';
import { currencySchema } from '../catalog/payment-methods.js';

/** Topes defensivos, no reglas de negocio. */
export const TRANSACTION_DESCRIPTION_MAX_LENGTH = 200;
export const MERCHANT_MAX_LENGTH = 80;
export const SEARCH_MAX_LENGTH = 100;
/** Un cursor es opaco, pero no infinito: lo que no quepa aquí no es un cursor nuestro. */
export const CURSOR_MAX_LENGTH = 200;

/** Filas por página si no se pide otra cantidad, y el máximo: pedir más se recorta. */
export const TRANSACTIONS_DEFAULT_LIMIT = 50;
export const TRANSACTIONS_MAX_LIMIT = 100;

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

/**
 * Corrige una transacción: todo menos su origen (`source`), que sigue diciendo de dónde vino
 * aunque se corrija a mano. Se manda solo lo que cambia, y al menos un campo.
 *
 * El tipo se puede cambiar, pero la categoría tiene que quedar del mismo tipo: en la práctica
 * `type` viaja junto con un `categoryId` nuevo. Eso lo decide el dominio.
 *
 * Sin `currency`, la moneda **no cambia**, aunque cambie el método de pago: nunca se supone.
 */
export const updateTransactionRequestSchema = z
  .strictObject({
    date: z.iso.date().optional(),
    type: transactionTypeSchema.optional(),
    categoryId: z.uuid().optional(),
    amount: decimalAmountSchema.optional(),
    currency: currencySchema.optional(),
    description: description.optional(),
    paymentMethodId: z.uuid().nullable().optional(),
    merchant: merchant.optional(),
  })
  .refine((body) => Object.keys(body).length > 0, { message: 'Nothing to change.' });

export type UpdateTransactionRequest = z.infer<typeof updateTransactionRequestSchema>;

/**
 * Filtros del listado. Todos opcionales y combinables; sin fechas, trae todo lo registrado.
 *
 * - `month` (`YYYY-MM`) o `from`/`to` (inclusivos), no los dos a la vez.
 * - `categoryId` trae también las transacciones de sus subcategorías.
 * - `q` busca en la descripción y el comercio, sin distinguir mayúsculas ni tildes.
 * - `limit` por defecto 50; más de 100 se recorta a 100.
 * - `cursor` es el `nextCursor` de la página anterior, tal cual: su contenido no es contrato.
 */
export const listTransactionsQuerySchema = z
  .object({
    month: z
      .string()
      .regex(/^\d{4}-(?:0[1-9]|1[0-2])$/u, { message: 'Expected a month such as "2026-09".' })
      .optional(),
    from: z.iso.date().optional(),
    to: z.iso.date().optional(),
    type: transactionTypeSchema.optional(),
    categoryId: z.uuid().optional(),
    paymentMethodId: z.uuid().optional(),
    currency: currencySchema.optional(),
    q: z.string().trim().min(1).max(SEARCH_MAX_LENGTH).optional(),
    cursor: z.string().min(1).max(CURSOR_MAX_LENGTH).optional(),
    limit: z
      .string()
      .regex(/^\d{1,6}$/u)
      .transform(Number)
      .pipe(z.int().min(1))
      .transform((limit) => Math.min(limit, TRANSACTIONS_MAX_LIMIT))
      .default(TRANSACTIONS_DEFAULT_LIMIT),
  })
  .refine((query) => query.month === undefined || (query.from ?? query.to) === undefined, {
    message: 'Use either month or from/to, not both.',
    path: ['month'],
  })
  .refine((query) => query.from === undefined || query.to === undefined || query.from <= query.to, {
    message: 'from cannot be after to.',
    path: ['from'],
  });

export type ListTransactionsQuery = z.infer<typeof listTransactionsQuerySchema>;
