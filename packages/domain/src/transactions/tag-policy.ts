import { DomainError } from '../errors/domain-error.js';
import { searchKey } from '../text/search-key.js';

/**
 * Las **etiquetas** miran los movimientos desde otro ángulo que la categoría: por momento del día
 * (`almuerzo`), por viaje (`viaje-cusco`), por con quién. Una transacción puede tener varias.
 * Decidido con el autor el 2026-09-28: se crean al escribirlas, solo tienen nombre y solo las
 * llevan las transacciones.
 */

/** Tope por transacción: más que esto deja de ordenar y pasa a ser ruido. */
export const MAX_TAGS_PER_TRANSACTION = 10;

/** Separa las etiquetas en el CSV de importación: dentro de una sería imposible de leer. */
const TAG_SEPARATOR = '|';

export class InvalidTagNameError extends DomainError {
  readonly code = 'TAG_NAME_INVALID';

  constructor() {
    super(`A tag needs a name, and cannot contain "${TAG_SEPARATOR}".`);
  }
}

export class TooManyTagsError extends DomainError {
  readonly code = 'TOO_MANY_TAGS';

  constructor() {
    super(`A transaction can have at most ${String(MAX_TAGS_PER_TRANSACTION)} tags.`);
  }
}

/** Una etiqueta como se muestra y la clave con la que se compara. */
export interface NormalizedTag {
  name: string;
  key: string;
}

/**
 * Las etiquetas de una transacción, listas para guardar. "Almuerzo", "ALMUERZO" y "almuerzó" son
 * la misma (`searchKey`): se queda la primera escritura. La ñ sigue siendo otra letra.
 */
export function normalizeTags(names: readonly string[]): NormalizedTag[] {
  const tags = new Map<string, NormalizedTag>();
  for (const raw of names) {
    const name = raw.trim();
    if (name === '' || name.includes(TAG_SEPARATOR)) throw new InvalidTagNameError();
    const key = searchKey(name);
    if (!tags.has(key)) tags.set(key, { name, key });
  }
  if (tags.size > MAX_TAGS_PER_TRANSACTION) throw new TooManyTagsError();

  return [...tags.values()];
}
