/**
 * Eventos que publica `identity`. Son parte de su API pública (`index.ts`): otro módulo los
 * escucha sin importar nada más de aquí.
 */

/** Se creó una cuenta. `catalog` lo escucha para darle las categorías iniciales. */
export const USER_REGISTERED = 'identity.user.registered';

export interface UserRegistered {
  userId: string;
}
