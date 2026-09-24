import { z } from 'zod';

/** Topes defensivos, no reglas de negocio: nadie llama "Visa BCP" a su tarjeta con 200 letras. */
export const PAYMENT_METHOD_ALIAS_MAX_LENGTH = 60;
export const INSTITUTION_MAX_LENGTH = 60;

/**
 * Tope defensivo para `last4`. Es más largo que cuatro **a propósito**: si llega un número de
 * tarjeta completo, lo rechaza el dominio con `INVALID_LAST4`, que dice qué regla se rompió, en
 * vez de un error genérico de forma. Que sean exactamente cuatro dígitos es regla del dominio.
 */
export const LAST4_INPUT_MAX_LENGTH = 32;

/** Los tipos y las monedas del glosario. Una prueba de la API comprueba que coincidan con el dominio. */
export const paymentMethodKindSchema = z.enum(['ACCOUNT', 'WALLET', 'CREDIT_CARD', 'CASH']);
export const currencySchema = z.enum(['PEN', 'USD']);

const alias = z.string().trim().min(1).max(PAYMENT_METHOD_ALIAS_MAX_LENGTH);
/** Sin banco se manda `null`, no un texto vacío. */
const institution = z.string().trim().min(1).max(INSTITUTION_MAX_LENGTH).nullable();
const last4 = z.string().max(LAST4_INPUT_MAX_LENGTH).nullable();
/** `null` = acepta las dos monedas (tarjeta bimoneda, efectivo). */
const currency = currencySchema.nullable();

/**
 * Solo la forma de lo que viaja. Qué combinaciones valen para cada tipo (una tarjeta necesita
 * sus últimos 4, una cuenta necesita moneda) lo decide `@sol-a-sol/domain`.
 *
 * **Estricto:** un campo desconocido se rechaza. No hay dónde poner un número de tarjeta, un
 * CVV o un vencimiento, y un `userId` en el cuerpo no se ignora en silencio: se rechaza.
 */
export const createPaymentMethodRequestSchema = z.strictObject({
  kind: paymentMethodKindSchema,
  alias,
  institution: institution.optional(),
  last4: last4.optional(),
  currency: currency.optional(),
});

export type CreatePaymentMethodRequest = z.infer<typeof createPaymentMethodRequestSchema>;

/**
 * Lo que se puede cambiar: todo menos el tipo, que en H5 tendrá datos propios colgados (la
 * línea y el día de corte de una tarjeta). Archivar y desarchivar van por `archived`.
 */
export const updatePaymentMethodRequestSchema = z
  .strictObject({
    alias: alias.optional(),
    institution: institution.optional(),
    last4: last4.optional(),
    currency: currency.optional(),
    archived: z.boolean().optional(),
  })
  .refine((body) => Object.keys(body).length > 0, { message: 'Nothing to change.' });

export type UpdatePaymentMethodRequest = z.infer<typeof updatePaymentMethodRequestSchema>;

/** `?includeArchived=true` para ver también los archivados. Solo `true` o `false`, sin adivinar. */
export const listPaymentMethodsQuerySchema = z.object({
  includeArchived: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
});

export type ListPaymentMethodsQuery = z.infer<typeof listPaymentMethodsQuerySchema>;
