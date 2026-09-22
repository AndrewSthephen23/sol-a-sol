import { z } from 'zod';

/** Tope defensivo para el nombre del dispositivo ("iPhone de Ana"), no una regla de negocio. */
export const TOKEN_NAME_MAX_LENGTH = 100;

/** Tope defensivo: hoy existe un solo scope, y nadie necesita pedir decenas. */
export const TOKEN_SCOPES_MAX_ITEMS = 10;

/**
 * Solo la forma de lo que viaja. **Qué scopes existen** y **cuántos días** puede durar un token
 * son reglas de negocio y viven en `@sol-a-sol/domain`: así no hay dos listas que un día dejen
 * de coincidir.
 */
export const createPersonalAccessTokenRequestSchema = z.object({
  /** Para reconocerlo en la lista y poder revocar solo ese dispositivo. */
  name: z.string().trim().min(1).max(TOKEN_NAME_MAX_LENGTH),
  scopes: z.array(z.string()).max(TOKEN_SCOPES_MAX_ITEMS),
  /** Días hasta que caduca. Si no llega, el dominio aplica su valor por defecto. */
  expiresInDays: z.int().optional(),
});

export type CreatePersonalAccessTokenRequest = z.infer<
  typeof createPersonalAccessTokenRequestSchema
>;
