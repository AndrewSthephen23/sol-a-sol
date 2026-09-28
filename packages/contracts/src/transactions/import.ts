import { z } from 'zod';

import { transactionTypeSchema } from '../catalog/categories.js';
import {
  currencySchema,
  INSTITUTION_MAX_LENGTH,
  LAST4_INPUT_MAX_LENGTH,
  paymentMethodKindSchema,
} from '../catalog/payment-methods.js';

/** Límites de un archivo de importación (decididos con el autor el 2026-09-28). */
export const IMPORT_MAX_BYTES = 1_048_576;
export const IMPORT_MAX_ROWS = 5000;

/**
 * El archivo viaja como **texto** dentro del JSON: la web lo lee y lo manda. No se guarda. Que no
 * pase de 1 MB (medido en bytes) y de 5 000 filas lo comprueba la API al leerlo.
 */
export const importPreviewRequestSchema = z.strictObject({
  csv: z.string().min(1),
});

export type ImportPreviewRequest = z.infer<typeof importPreviewRequestSchema>;

/**
 * Qué hacer con una categoría (o subcategoría) del archivo que falta o está archivada. Se
 * identifica como en la vista previa: tipo, categoría y subcategoría, sin mayúsculas ni tildes.
 *
 * - `create`: crearla (y su madre, si también falta). Solo si falta.
 * - `use`: sus filas van a otra categoría existente y activa, del mismo tipo.
 * - `restore`: restaurarla. Solo si está archivada.
 */
const categoryTarget = {
  type: transactionTypeSchema,
  category: z.string().min(1),
  subcategory: z.string().min(1).nullable(),
};

export const categoryDecisionSchema = z.discriminatedUnion('action', [
  z.strictObject({ ...categoryTarget, action: z.literal('create') }),
  z.strictObject({ ...categoryTarget, action: z.literal('use'), categoryId: z.uuid() }),
  z.strictObject({ ...categoryTarget, action: z.literal('restore') }),
]);

/**
 * Qué hacer con un método de pago (o cuenta de una transferencia) que falta o está archivado,
 * identificado por su alias, sin mayúsculas ni tildes.
 *
 * - `create`: crearlo con ese alias y estos datos, con las mismas reglas que a mano. Solo si falta.
 * - `use`: sus filas van a otro método existente y activo.
 * - `restore`: restaurarlo. Solo si está archivado.
 */
export const paymentMethodDecisionSchema = z.discriminatedUnion('action', [
  z.strictObject({
    alias: z.string().min(1),
    action: z.literal('create'),
    kind: paymentMethodKindSchema,
    institution: z.string().trim().min(1).max(INSTITUTION_MAX_LENGTH).nullable().optional(),
    last4: z.string().max(LAST4_INPUT_MAX_LENGTH).nullable().optional(),
    currency: currencySchema.nullable().optional(),
  }),
  z.strictObject({ alias: z.string().min(1), action: z.literal('use'), paymentMethodId: z.uuid() }),
  z.strictObject({ alias: z.string().min(1), action: z.literal('restore') }),
]);

/**
 * Confirma la importación: el mismo archivo de la vista previa y las decisiones sobre lo que
 * falta. Entra **todo o nada**.
 */
export const importRequestSchema = z.strictObject({
  csv: z.string().min(1),
  categories: z.array(categoryDecisionSchema).max(IMPORT_MAX_ROWS).default([]),
  paymentMethods: z.array(paymentMethodDecisionSchema).max(IMPORT_MAX_ROWS).default([]),
});

export type CategoryDecision = z.infer<typeof categoryDecisionSchema>;
export type PaymentMethodDecision = z.infer<typeof paymentMethodDecisionSchema>;
export type ImportRequest = z.infer<typeof importRequestSchema>;
