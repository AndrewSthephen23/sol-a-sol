/**
 * Códigos de recuperación del segundo factor: la salida cuando se pierde el teléfono.
 *
 * Se muestran **una sola vez** al activar el segundo factor, se guardan hasheados y cada uno
 * sirve **una sola vez**. Sin ellos, perder el teléfono dejaría al dueño fuera de sus propias
 * finanzas sin más salida que tocar la base de datos.
 */
export const RECOVERY_CODE_COUNT = 10;

/** Doce símbolos de un alfabeto de 32 son unos 60 bits: no se adivinan probando. */
export const RECOVERY_CODE_LENGTH = 12;

/**
 * Base32 de Crockford: sin `I`, `L`, `O` ni `U`.
 *
 * Estos códigos se copian a mano de un papel, y ahí `I` y `1`, u `O` y `0`, se confunden.
 * (La `U` se omite para no formar palabras desafortunadas por casualidad.)
 */
export const RECOVERY_CODE_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

const GROUP_SIZE = 4;

/** `ABCDEFGHJKMN` → `ABCD-EFGH-JKMN`, que es más fácil de copiar sin perderse. */
export function formatRecoveryCode(code: string): string {
  const groups: string[] = [];

  for (let start = 0; start < code.length; start += GROUP_SIZE) {
    groups.push(code.slice(start, start + GROUP_SIZE));
  }

  return groups.join('-');
}

/**
 * Deja el código como se guardó, para poder compararlo.
 *
 * Se aceptan los separadores que cualquiera podría teclear y las minúsculas: quien está
 * recuperando el acceso ya tiene bastante con haber perdido el teléfono.
 */
export function normalizeRecoveryCode(code: string): string {
  return code.replaceAll(/[\s\-_.]/g, '').toUpperCase();
}
