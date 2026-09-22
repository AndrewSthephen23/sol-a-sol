import type { AttemptRecord } from '@sol-a-sol/domain';

/**
 * Los intentos fallidos de una llave: un correo (hasheado) o una IP.
 *
 * Es el único repositorio sin `userId`, y a propósito: un intento contra un correo que no existe
 * no tiene usuario, y es justo el caso que hay que frenar.
 */
export interface LoginThrottleRepository {
  find(key: string): Promise<AttemptRecord | null>;

  save(key: string, record: AttemptRecord): Promise<void>;

  /** Olvida esas llaves: lo que hace un inicio de sesión correcto. */
  clear(keys: string[]): Promise<void>;

  /** Limpieza: filas cuyo último fallo es anterior a ese instante. Devuelve cuántas borró. */
  deleteOlderThan(instant: Date): Promise<number>;
}

/** Token de inyección: en TypeScript una interfaz no existe en tiempo de ejecución. */
export const LOGIN_THROTTLE_REPOSITORY = Symbol('LoginThrottleRepository');
