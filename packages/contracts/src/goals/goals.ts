import { z } from 'zod';

import { currencySchema } from '../catalog/payment-methods.js';
import { decimalAmountSchema } from '../transactions/transactions.js';

/**
 * Solo la forma de lo que viaja. Que el objetivo sea mayor que cero, que el fin vaya después del
 * inicio, que un aporte no tenga fecha futura y que un retiro no saque más de lo ahorrado lo decide
 * `@sol-a-sol/domain`, diciendo qué regla se rompió.
 *
 * **Estrictos:** un campo desconocido se rechaza, y un `userId` en el cuerpo no se ignora en
 * silencio.
 */

/** Tope defensivo, no regla de negocio: como el alias de un método de pago. */
export const GOAL_NAME_MAX_LENGTH = 60;

const name = z.string().trim().min(1).max(GOAL_NAME_MAX_LENGTH);

/** Aporte (suma) o retiro (resta): el monto viaja siempre positivo. */
export const goalContributionKindSchema = z.enum(['CONTRIBUTION', 'WITHDRAWAL']);

/**
 * Una meta nueva. La moneda se elige aquí y **queda fija** (2026-10-03): sus aportes van en ella y
 * nunca se convierte.
 */
export const createGoalRequestSchema = z.strictObject({
  name,
  currency: currencySchema,
  targetAmount: decimalAmountSchema,
  startDate: z.iso.date(),
  endDate: z.iso.date(),
});

/**
 * Lo que se puede corregir: todo menos la moneda. Archivar y desarchivar van por `archived`. Las
 * reglas se comprueban sobre la meta **como quedaría**, y el progreso se recalcula al consultar.
 */
export const updateGoalRequestSchema = z
  .strictObject({
    name: name.optional(),
    targetAmount: decimalAmountSchema.optional(),
    startDate: z.iso.date().optional(),
    endDate: z.iso.date().optional(),
    archived: z.boolean().optional(),
  })
  .refine((body) => Object.keys(body).length > 0, { message: 'Nothing to change.' });

/** `?includeArchived=true` para ver también las archivadas. Solo `true` o `false`, sin adivinar. */
export const listGoalsQuerySchema = z.object({
  includeArchived: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
});

/**
 * Un aporte o un retiro **manual**, con su fecha y su monto; o un aporte **enlazado** a una
 * transacción de ahorro o inversión, que toma la transacción entera y la sigue (un retiro nunca se
 * enlaza).
 */
export const createGoalContributionRequestSchema = z.discriminatedUnion('source', [
  z.strictObject({
    source: z.literal('MANUAL'),
    kind: goalContributionKindSchema,
    amount: decimalAmountSchema,
    date: z.iso.date(),
  }),
  z.strictObject({
    source: z.literal('TRANSACTION'),
    transactionId: z.uuid(),
  }),
]);

/** El id de la ruta: un UUID, o la petición no llega a buscar nada. */
export const goalParamsSchema = z.object({ id: z.uuid() });

/** La meta y el aporte de la ruta: UUID, o la petición no llega a buscar nada. */
export const goalContributionParamsSchema = z.object({ id: z.uuid(), contributionId: z.uuid() });

export type CreateGoalRequest = z.infer<typeof createGoalRequestSchema>;
export type UpdateGoalRequest = z.infer<typeof updateGoalRequestSchema>;
export type ListGoalsQuery = z.infer<typeof listGoalsQuerySchema>;
export type CreateGoalContributionRequest = z.infer<typeof createGoalContributionRequestSchema>;
export type GoalParams = z.infer<typeof goalParamsSchema>;
export type GoalContributionParams = z.infer<typeof goalContributionParamsSchema>;
