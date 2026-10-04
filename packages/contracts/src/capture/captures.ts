import { z } from 'zod';

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

export type CaptureSource = z.infer<typeof captureSourceSchema>;
export type CreateCaptureRequest = z.infer<typeof createCaptureRequestSchema>;
