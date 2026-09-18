import { z } from 'zod';

/** Longitud máxima de una dirección de correo según RFC 5321. */
export const EMAIL_MAX_LENGTH = 254;

/**
 * Tope defensivo, no una regla de negocio: argon2id gasta memoria y CPU a propósito, así que
 * una contraseña arbitrariamente larga sería una forma barata de tumbar la API.
 */
export const PASSWORD_MAX_LENGTH = 256;

/**
 * El correo se normaliza aquí porque `users.email` es único: sin bajar a minúsculas,
 * `Ana@example.com` y `ana@example.com` serían dos cuentas distintas.
 */
export const emailSchema = z.string().trim().toLowerCase().max(EMAIL_MAX_LENGTH).pipe(z.email());

/**
 * Solo la forma de lo que viaja: que sea texto y quepa.
 *
 * La **política** (mínimo 12 caracteres y rechazo de contraseñas filtradas) es una regla de
 * negocio y vive en `@sol-a-sol/domain`, no aquí: duplicarla en dos paquetes es la forma segura
 * de que un día dejen de coincidir. No se recorta ni se normaliza: los espacios de una
 * contraseña son parte de la contraseña.
 */
export const passwordSchema = z.string().max(PASSWORD_MAX_LENGTH);

export const registerRequestSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
});

export const loginRequestSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  /** Código del segundo factor. Solo llega si la cuenta lo tiene activado. */
  totpCode: z.string().trim().optional(),
});

export type RegisterRequest = z.infer<typeof registerRequestSchema>;
export type LoginRequest = z.infer<typeof loginRequestSchema>;
