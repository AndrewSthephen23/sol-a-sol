import { z } from 'zod';

import { currencySchema } from '../catalog/payment-methods.js';
import { decimalAmountSchema } from '../transactions/transactions.js';

/**
 * Solo la forma de lo que viaja. Los rangos (día de corte 1 a 31, 1 a 60 días después del corte),
 * que los montos no sean negativos y que la moneda la acepte la tarjeta los decide
 * `@sol-a-sol/domain`, diciendo qué regla se rompió.
 *
 * **Estrictos:** un campo desconocido se rechaza. No hay dónde poner un número de tarjeta, un CVV
 * ni un vencimiento, y un `userId` en el cuerpo no se ignora en silencio.
 */

/** Un monto con su moneda. El monto viaja como **string decimal**, nunca como número. */
export const moneyRequestSchema = z.strictObject({
  amount: decimalAmountSchema,
  currency: currencySchema,
});

/** Cómo se calcula la fecha límite de pago: N días después del corte, o un día fijo del mes. */
export const paymentDueRuleSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('DAYS_AFTER_STATEMENT'), days: z.int() }),
  z.strictObject({ kind: z.literal('DAY_OF_MONTH'), day: z.int() }),
]);

/** Lo que ya se debía antes de registrar en la app: un monto por moneda, desde una fecha. */
export const openingBalanceSchema = z.strictObject({
  date: z.iso.date(),
  amounts: z.array(moneyRequestSchema).min(1).max(2),
});

/** Configura un método de pago `CREDIT_CARD` como tarjeta. Sin saldo inicial, la deuda arranca en cero. */
export const createCreditCardRequestSchema = z.strictObject({
  paymentMethodId: z.uuid(),
  creditLimit: moneyRequestSchema,
  statementDay: z.int(),
  paymentDueRule: paymentDueRuleSchema,
  openingBalance: openingBalanceSchema.nullable().optional(),
});

/**
 * Lo que se puede corregir: todo menos el método de pago. `openingBalance: null` lo quita. Las
 * reglas se comprueban sobre la tarjeta **como quedaría**.
 */
export const updateCreditCardRequestSchema = z
  .strictObject({
    creditLimit: moneyRequestSchema.optional(),
    statementDay: z.int().optional(),
    paymentDueRule: paymentDueRuleSchema.optional(),
    openingBalance: openingBalanceSchema.nullable().optional(),
  })
  .refine((body) => Object.keys(body).length > 0, { message: 'Nothing to change.' });

/** El id de la ruta: un UUID, o la petición no llega a buscar nada. */
export const creditCardParamsSchema = z.object({ id: z.uuid() });

export type MoneyRequest = z.infer<typeof moneyRequestSchema>;
export type PaymentDueRuleRequest = z.infer<typeof paymentDueRuleSchema>;
export type OpeningBalanceRequest = z.infer<typeof openingBalanceSchema>;
export type CreateCreditCardRequest = z.infer<typeof createCreditCardRequestSchema>;
export type UpdateCreditCardRequest = z.infer<typeof updateCreditCardRequestSchema>;
export type CreditCardParams = z.infer<typeof creditCardParamsSchema>;
