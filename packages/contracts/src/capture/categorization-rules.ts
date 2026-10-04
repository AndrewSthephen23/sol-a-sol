import { z } from 'zod';

/**
 * Las reglas de categorización de la bandeja (decisión 12 de H7): si el comercio de una captura
 * (o, sin comercio, el texto de la notificación) **contiene** el patrón, sin tildes ni
 * mayúsculas, se sugiere la categoría. Solo la forma: que la categoría sea de la cuenta y esté
 * activa, y que el patrón no se repita, lo decide la API.
 */

/** Tope defensivo, como el comercio de una captura. */
export const RULE_PATTERN_MAX_LENGTH = 120;
/** El tope de un `INTEGER` de la base, no una regla de negocio: la prioridad no tiene tope. */
const PRIORITY_MAX = 2_147_483_647;

const pattern = z.string().trim().min(1).max(RULE_PATTERN_MAX_LENGTH);
/** Cero o más; gana la mayor (decidido el 2026-10-03). */
const priority = z.int().min(0).max(PRIORITY_MAX);

export const createCategorizationRuleRequestSchema = z.strictObject({
  pattern,
  categoryId: z.uuid(),
  priority: priority.default(0),
});

export const updateCategorizationRuleRequestSchema = z
  .strictObject({
    pattern: pattern.optional(),
    categoryId: z.uuid().optional(),
    priority: priority.optional(),
  })
  .refine((body) => Object.keys(body).length > 0, { message: 'Nothing to change.' });

/** El id de la ruta: un UUID, o la petición no llega a buscar nada. */
export const categorizationRuleParamsSchema = z.object({ id: z.uuid() });

export type CreateCategorizationRuleRequest = z.infer<typeof createCategorizationRuleRequestSchema>;
export type UpdateCategorizationRuleRequest = z.infer<typeof updateCategorizationRuleRequestSchema>;
export type CategorizationRuleParams = z.infer<typeof categorizationRuleParamsSchema>;
