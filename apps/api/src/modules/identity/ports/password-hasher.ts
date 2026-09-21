/**
 * Cómo se guardan y se comprueban las contraseñas. La implementación vive en `infrastructure/`:
 * el caso de uso depende de esta interfaz, no de argon2 (ADR-0001).
 */
export interface PasswordHasher {
  /** Devuelve el hash completo, con sus parámetros y su sal dentro (formato PHC). */
  hash(plain: string): Promise<string>;

  /** `false` si la contraseña no corresponde. Nunca lanza por una contraseña equivocada. */
  verify(plain: string, hash: string): Promise<boolean>;
}

/** Token de inyección: en TypeScript una interfaz no existe en tiempo de ejecución. */
export const PASSWORD_HASHER = Symbol('PasswordHasher');
