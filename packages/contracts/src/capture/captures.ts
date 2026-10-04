import { z } from 'zod';

import { transactionTypeSchema } from '../catalog/categories.js';
import { currencySchema } from '../catalog/payment-methods.js';
import {
  CURSOR_MAX_LENGTH,
  decimalAmountSchema,
  TRANSACTION_DESCRIPTION_MAX_LENGTH,
} from '../transactions/transactions.js';

/**
 * Lo que manda el teléfono a `POST /captures`: un atajo de iPhone (monto, comercio y tarjeta por
 * separado) o una automatización de Android (el texto de la notificación). Solo la **forma**:
 * entender el monto, la fecha, el método y la categoría lo decide `@sol-a-sol/domain`, que nunca
 * rechaza una captura bien formada (decisión 8.1 del plan: se guarda siempre).
 *
 * **Estricto:** un campo desconocido se rechaza, y un `userId` en el cuerpo no se ignora en
 * silencio. Los largos son topes defensivos, no reglas de negocio.
 */

export const CAPTURE_AMOUNT_TEXT_MAX_LENGTH = 40;
export const CAPTURE_MERCHANT_MAX_LENGTH = 120;
export const CAPTURE_CARD_MAX_LENGTH = 60;
/** Una notificación larga de banco cabe de sobra. */
export const CAPTURE_RAW_TEXT_MAX_LENGTH = 2000;
export const IDEMPOTENCY_KEY_MAX_LENGTH = 200;

export const captureSourceSchema = z.enum(['IOS_SHORTCUT', 'ANDROID_AUTOMATION']);

/** Un atajo manda vacía o nula la variable que no tiene: las dos cosas significan «no vino». */
const optionalText = (max: number) => z.string().max(max).nullish();

export const createCaptureRequestSchema = z.strictObject({
  source: captureSourceSchema,
  /** Un instante **con zona** (`2026-10-03T21:30:00-05:00` o `…Z`): sin ella sería ambiguo. */
  occurredAt: z.iso.datetime({ offset: true }),
  /** El monto como lo escribe el teléfono (`S/ 25.90`, `25.90`); se lee en el dominio. */
  amountText: optionalText(CAPTURE_AMOUNT_TEXT_MAX_LENGTH),
  merchant: optionalText(CAPTURE_MERCHANT_MAX_LENGTH),
  /** Alias o últimos 4 de la tarjeta (`Visa BCP`, `4242`). Nunca el número completo. */
  card: optionalText(CAPTURE_CARD_MAX_LENGTH),
  /** El texto de la notificación del banco, tal cual. */
  rawText: optionalText(CAPTURE_RAW_TEXT_MAX_LENGTH),
});

/**
 * La cabecera `Idempotency-Key`, **opcional** (decisión 7): sin ella, la API arma una con todo el
 * pedido. Vacía cuenta como ausente. Solo caracteres visibles y espacios.
 */
export const idempotencyKeySchema = z
  .string()
  .trim()
  .max(IDEMPOTENCY_KEY_MAX_LENGTH)
  .regex(/^[\x20-\x7E]*$/u)
  .optional()
  .transform((key) => (key === '' ? undefined : key));

/** Por defecto 50 por página; más de 100 se recorta a 100. */
export const CAPTURES_DEFAULT_LIMIT = 50;
export const CAPTURES_MAX_LIMIT = 100;

/**
 * La bandeja: `inbox` (por revisar, con las duplicadas marcadas; por defecto) o `discarded` (las
 * descartadas, que se borran a los 90 días). Las confirmadas no se listan: ya son transacciones
 * (decidido el 2026-10-04). Primero la más reciente.
 */
export const listCapturesQuerySchema = z.object({
  status: z.enum(['inbox', 'discarded']).default('inbox'),
  cursor: z.string().min(1).max(CURSOR_MAX_LENGTH).optional(),
  limit: z
    .string()
    .regex(/^\d{1,6}$/u)
    .transform(Number)
    .pipe(z.int().min(1))
    .transform((limit) => Math.min(limit, CAPTURES_MAX_LIMIT))
    .default(CAPTURES_DEFAULT_LIMIT),
});

/**
 * Corregir una captura antes de confirmarla (decisión 10: todo se corrige). Lo que no viene no
 * cambia; `null` lo borra. Si cambia el tipo sin categoría, la que había se limpia. Que el monto
 * sea positivo, la fecha no sea futura y la categoría sea del tipo lo decide el dominio.
 */
export const updateCaptureRequestSchema = z
  .strictObject({
    type: transactionTypeSchema.optional(),
    date: z.iso.date().optional(),
    amount: decimalAmountSchema.nullable().optional(),
    currency: currencySchema.nullable().optional(),
    categoryId: z.uuid().nullable().optional(),
    paymentMethodId: z.uuid().nullable().optional(),
    merchant: z.string().max(CAPTURE_MERCHANT_MAX_LENGTH).nullable().optional(),
    description: z.string().max(TRANSACTION_DESCRIPTION_MAX_LENGTH).nullable().optional(),
  })
  .refine((body) => Object.keys(body).length > 0, { message: 'Nothing to change.' });

/** El id de la ruta: un UUID, o la petición no llega a buscar nada. */
export const captureParamsSchema = z.object({ id: z.uuid() });

export type CaptureSource = z.infer<typeof captureSourceSchema>;
export type ListCapturesQuery = z.infer<typeof listCapturesQuerySchema>;
export type UpdateCaptureRequest = z.infer<typeof updateCaptureRequestSchema>;
export type CaptureParams = z.infer<typeof captureParamsSchema>;
export type CreateCaptureRequest = z.infer<typeof createCaptureRequestSchema>;
