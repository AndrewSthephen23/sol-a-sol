import { z } from 'zod';

import { currencySchema } from '../catalog/payment-methods.js';
import { decimalAmountSchema, TRANSACTION_DESCRIPTION_MAX_LENGTH } from './transactions.js';

/**
 * Registra una transferencia entre dos cuentas propias, desde la web (`source: MANUAL`).
 *
 * Solo la forma. Que las cuentas sean distintas, propias y activas, de dónde sale cada moneda y
 * cuándo se exige el monto recibido lo decide `@sol-a-sol/domain`:
 *
 * - Sin monedas, se usan las de las cuentas.
 * - En la misma moneda, `receivedAmount` sobra (y si llega, tiene que ser igual a `amount`).
 * - Con un cambio de moneda, `receivedAmount` es obligatorio: nunca se convierte.
 *
 * **Estricto:** un campo desconocido se rechaza, y un `userId` o un `source` no se ignoran.
 */
export const createTransferRequestSchema = z.strictObject({
  /** Día en que pasó, `YYYY-MM-DD`, sin hora. */
  date: z.iso.date(),
  fromPaymentMethodId: z.uuid(),
  toPaymentMethodId: z.uuid(),
  /** Lo que salió de la cuenta de origen. */
  amount: decimalAmountSchema,
  currency: currencySchema.optional(),
  /** Lo que llegó a la cuenta de destino, copiado del voucher. */
  receivedAmount: decimalAmountSchema.optional(),
  receivedCurrency: currencySchema.optional(),
  description: z.string().trim().min(1).max(TRANSACTION_DESCRIPTION_MAX_LENGTH),
});

export type CreateTransferRequest = z.infer<typeof createTransferRequestSchema>;

/**
 * Corrige una transferencia: todo menos su origen (`source`). Se manda solo lo que cambia, y al
 * menos un campo. Las reglas se aplican a la transferencia **como quedaría**.
 *
 * En un cambio de moneda, corregir el monto enviado exige mandar también el recibido: cambiar
 * uno solo movería el tipo de cambio sin que nadie lo diga (decidido con el autor el 2026-09-28).
 */
export const updateTransferRequestSchema = z
  .strictObject({
    date: z.iso.date().optional(),
    fromPaymentMethodId: z.uuid().optional(),
    toPaymentMethodId: z.uuid().optional(),
    amount: decimalAmountSchema.optional(),
    currency: currencySchema.optional(),
    receivedAmount: decimalAmountSchema.optional(),
    receivedCurrency: currencySchema.optional(),
    description: z.string().trim().min(1).max(TRANSACTION_DESCRIPTION_MAX_LENGTH).optional(),
  })
  .refine((body) => Object.keys(body).length > 0, { message: 'Nothing to change.' });

export type UpdateTransferRequest = z.infer<typeof updateTransferRequestSchema>;
