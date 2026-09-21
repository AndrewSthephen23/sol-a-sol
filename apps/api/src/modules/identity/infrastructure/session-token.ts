import { createHash, randomBytes } from 'node:crypto';

/** 256 bits: no se adivina por fuerza bruta ni se repite por casualidad. */
const TOKEN_BYTES = 32;

export interface SessionToken {
  /** El valor que viaja en la cookie. Solo existe aquí y en el navegador. */
  value: string;
  /** Lo único que se guarda. */
  hash: string;
}

/**
 * Se hashea con SHA-256 y no con argon2id **a propósito**.
 *
 * argon2 es lento por diseño, para proteger secretos que elige una persona y se pueden adivinar.
 * Esto son 256 bits aleatorios: no hay nada que adivinar, y el hash tiene que poder buscarse en
 * un índice en cada refresco, cosa que un hash con sal por fila no permite.
 */
export function hashSessionToken(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export function createSessionToken(): SessionToken {
  // base64url: cabe en una cookie sin escapar nada.
  const value = randomBytes(TOKEN_BYTES).toString('base64url');

  return { value, hash: hashSessionToken(value) };
}
