import type { NormalizedTag } from '@sol-a-sol/domain';

/** Una etiqueta con cuántas transacciones **vigentes** la llevan. */
export interface Tag {
  id: string;
  name: string;
  transactionCount: number;
}

/** Una etiqueta como se guarda: con la clave por la que se compara. */
export interface StoredTag {
  id: string;
  name: string;
  key: string;
}

/**
 * Todo método **exige el `userId`**, y va dentro del `WHERE`: la etiqueta de otra cuenta no
 * existe para quien pregunta.
 */
export interface TagRepository {
  /** Ordenadas por nombre. */
  list(userId: string): Promise<Tag[]>;

  /** `null` si no existe o es de otra cuenta. */
  find(userId: string, id: string): Promise<StoredTag | null>;

  /** La etiqueta de la cuenta con esa clave (`searchKey`), si hay una. */
  findByKey(userId: string, key: string): Promise<StoredTag | null>;

  /**
   * Cambia el nombre (y con él la clave). `null` si ya no existe. Lanza `TagNameTakenError` si
   * otra petición creó al mismo tiempo una etiqueta con esa clave.
   */
  rename(userId: string, id: string, tag: NormalizedTag): Promise<Tag | null>;

  /**
   * Pasa las transacciones de `fromId` a `intoId` (sin duplicar las que ya tenían las dos), le da
   * a `intoId` el nombre indicado y borra `fromId`, todo en una transacción de la base. Lanza
   * `TagNotFoundError` (y no cambia nada) si alguna de las dos ya no existe.
   */
  merge(userId: string, fromId: string, intoId: string, name: string): Promise<Tag>;

  /** La borra y la quita de todas las transacciones. `false` si no existe o es de otra cuenta. */
  delete(userId: string, id: string): Promise<boolean>;
}

export const TAG_REPOSITORY = Symbol('TagRepository');
