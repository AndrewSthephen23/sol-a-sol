import { z } from 'zod';

export const PROBLEM_CONTENT_TYPE = 'application/problem+json';

/** Un fallo concreto en un campo de la petición. */
export const problemFieldErrorSchema = z.object({
  /** Ruta del campo con puntos: `email`, `card.last4`, `items.0.amount`. */
  field: z.string(),
  /** Código estable en inglés que la web traduce: `TOO_BIG`, `INVALID_FORMAT`. */
  code: z.string(),
  /** Texto de apoyo para depurar. No se muestra al usuario. */
  message: z.string(),
});

/**
 * Formato de error de toda la API (RFC 9457).
 *
 * Vive en los contratos porque es lo que más viaja por HTTP: lo produce la API y lo lee la web,
 * que traduce `code` al español. Del mismo esquema sale su descripción en el OpenAPI.
 */
export const problemDetailsSchema = z.object({
  /** URN estable del tipo de error: `urn:sol-a-sol:error:invalid-amount`. */
  type: z.string(),
  /** Título corto del tipo de error, en inglés. No es el texto que ve el usuario. */
  title: z.string(),
  status: z.int().min(100).max(599),
  detail: z.string(),
  /** Solo en errores de validación: un elemento por campo que falló. */
  errors: z.array(problemFieldErrorSchema).optional(),
});

export type ProblemFieldError = z.infer<typeof problemFieldErrorSchema>;
export type ProblemDetails = z.infer<typeof problemDetailsSchema>;
