import { z } from 'zod';

import { currencySchema } from '../catalog/payment-methods.js';
import { decimalAmountSchema } from '../transactions/transactions.js';

/**
 * Tope defensivo, no regla de negocio: una partida por categoría madre y moneda no pasa de unas
 * decenas. Lo que no quepa aquí no es un presupuesto de verdad.
 */
export const BUDGET_LINES_MAX_ITEMS = 500;

/**
 * El mes de la ruta (`/budgets/2026/9`): solo la forma. Que el mes esté entre 1 y 12 y el año
 * sea razonable lo decide el dominio (`BUDGET_MONTH_INVALID`), diciendo qué regla se rompió.
 */
export const budgetMonthParamsSchema = z.object({
  year: z
    .string()
    .regex(/^\d{4}$/u, { message: 'Expected a year such as "2026".' })
    .transform(Number),
  month: z
    .string()
    .regex(/^\d{1,2}$/u, { message: 'Expected a month such as "9".' })
    .transform(Number),
});

export type BudgetMonthParams = z.infer<typeof budgetMonthParamsSchema>;

/**
 * Una partida: cuánto se planea para una categoría madre en una moneda. El monto viaja como
 * **string decimal**; que sea cero o más, que la categoría sea madre y activa y que no se repita
 * con la misma moneda lo decide el dominio.
 */
export const budgetLineRequestSchema = z.strictObject({
  categoryId: z.uuid(),
  plannedAmount: decimalAmountSchema,
  currency: currencySchema,
});

/**
 * Guarda el presupuesto de un mes **entero**: la lista reemplaza a la anterior (`[]` lo vacía).
 * Mandar lo mismo dos veces deja lo mismo.
 *
 * **Estricto:** un campo desconocido se rechaza, y un `userId` no se ignora en silencio.
 */
export const putBudgetRequestSchema = z.strictObject({
  lines: z.array(budgetLineRequestSchema).max(BUDGET_LINES_MAX_ITEMS),
});

export type BudgetLineRequest = z.infer<typeof budgetLineRequestSchema>;
export type PutBudgetRequest = z.infer<typeof putBudgetRequestSchema>;
