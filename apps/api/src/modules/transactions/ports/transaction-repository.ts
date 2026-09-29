import type {
  Currency,
  LocalDate,
  Money,
  NormalizedTag,
  TransactionSource,
  TransactionType,
  TypedAmount,
} from '@sol-a-sol/domain';

/** Una transacción vigente, como la ve quien la registró. */
export interface Transaction {
  id: string;
  date: LocalDate;
  type: TransactionType;
  categoryId: string;
  /** Siempre positivo; el signo lo da `type`. Lleva la moneda. */
  amount: Money;
  description: string;
  paymentMethodId: string | null;
  merchant: string | null;
  source: TransactionSource;
  /** Captura del celular de la que salió (H7). */
  captureId: string | null;
  /** Nombres de sus etiquetas, en orden alfabético (`orderTags`). */
  tags: string[];
  createdAt: Date;
  updatedAt: Date;
}

export interface NewTransaction {
  userId: string;
  date: LocalDate;
  type: TransactionType;
  categoryId: string;
  amount: Money;
  description: string;
  paymentMethodId: string | null;
  merchant: string | null;
  source: TransactionSource;
  /** Las que no existen en la cuenta se crean; las que existen se reutilizan por su clave. */
  tags: readonly NormalizedTag[];
  /** Solo al importar: la huella de su fila del CSV, única por cuenta. */
  importKey?: string;
}

/** Lo que se puede corregir. El origen (`source`) no está: no cambia al editar. */
export interface TransactionChanges {
  date?: LocalDate;
  type?: TransactionType;
  categoryId?: string;
  /** Lleva la moneda: cambiarla es cambiar el monto. */
  amount?: Money;
  description?: string;
  paymentMethodId?: string | null;
  merchant?: string | null;
  /** **Reemplaza** las etiquetas; `[]` las quita todas. */
  tags?: readonly NormalizedTag[];
}

/** Qué transacciones listar. Todo opcional; sin nada, todas las vigentes de la cuenta. */
/** Lo sumado de una categoría en un tipo y una moneda. */
export type CategoryAmount = TypedAmount & { categoryId: string };

export interface TransactionFilter {
  /** Inclusivo. */
  from?: LocalDate;
  /** Inclusivo. */
  to?: LocalDate;
  type?: TransactionType;
  /** Alguna de estas categorías: una madre llega ya con sus hijas. */
  categoryIds?: readonly string[];
  paymentMethodId?: string;
  currency?: Currency;
  /** Ya normalizado con `searchKey`: se busca dentro de la descripción o el comercio. */
  search?: string;
  /** Clave (`searchKey`) de una etiqueta: solo las transacciones que la tienen. */
  tagKey?: string;
}

/**
 * Dónde quedó la página anterior: la última fila entregada. El listado va por fecha descendente
 * y, en el mismo día, por id descendente (UUIDv7, que ordena por creación y desempata).
 */
export interface PagePosition {
  date: LocalDate;
  id: string;
}

/**
 * El orden del listado, igual para transacciones y transferencias: negativo si `a` va antes que
 * `b`. Por eso dos páginas de tablas distintas se pueden mezclar en una sola.
 */
/**
 * El orden en que se devuelven las etiquetas de una transacción: alfabético en español, igual en
 * cualquier adaptador.
 */
export function orderTags(names: readonly string[]): string[] {
  return names.toSorted((a, b) => a.localeCompare(b, 'es'));
}

export function newestFirst(a: PagePosition, b: PagePosition): number {
  return b.date.compareTo(a.date) || b.id.localeCompare(a.id);
}

/**
 * Todo método **exige el `userId`**, y va dentro del `WHERE`: no existe forma de leer una
 * transacción sin decir de quién es. Las borradas no aparecen en las consultas normales.
 */
export interface TransactionRepository {
  create(transaction: NewTransaction): Promise<Transaction>;

  /** `null` si no existe, **es de otra cuenta o está borrada**. */
  find(userId: string, id: string): Promise<Transaction | null>;

  /** `null` si no existe, es de otra cuenta o está borrada: una borrada no se edita. */
  update(userId: string, id: string, changes: TransactionChanges): Promise<Transaction | null>;

  /** Borrado lógico. `false` si no existe, es de otra cuenta o ya estaba borrada. */
  softDelete(userId: string, id: string, deletedAt: Date): Promise<boolean>;

  /**
   * Una página de vigentes, de la más reciente a la más antigua, empezando **después** de
   * `after`. Como la posición es la de una fila y no un número de página, lo que se registre o se
   * borre entre dos páginas no hace repetir ni saltar filas.
   */
  list(
    userId: string,
    filter: TransactionFilter,
    page: { after: PagePosition | null; limit: number },
  ): Promise<Transaction[]>;

  /** La suma por tipo y moneda de **todo** lo que cumple el filtro, no solo de una página. */
  totals(userId: string, filter: TransactionFilter): Promise<TypedAmount[]>;

  /**
   * Lo mismo, además **por categoría** (la de cada transacción, sin subir a su madre): lo que
   * leen otros módulos, como el presupuesto, por `TransactionsLookup`.
   */
  totalsByCategory(userId: string, filter: TransactionFilter): Promise<CategoryAmount[]>;

  /**
   * Pasa **todas** las transacciones de una categoría a otra, borradas incluidas, en una sola
   * transacción de la base. Con `tag`, además se la agrega a cada una (crea la etiqueta si no
   * existe), salvo a las que ya tienen el máximo. Devuelve cuántas movió.
   */
  reassignCategory(
    userId: string,
    fromId: string,
    intoId: string,
    tag?: NormalizedTag,
  ): Promise<number>;

  /** De estas huellas, las que ya tiene alguna transacción de la cuenta (borradas incluidas). */
  importedKeys(userId: string, keys: readonly string[]): Promise<string[]>;

  /** Deshace el borrado. `false` si no estaba borrada, no existe o es de otra cuenta. */
  restore(userId: string, id: string): Promise<boolean>;
}

/** Token de inyección: en TypeScript una interfaz no existe en tiempo de ejecución. */
export const TRANSACTION_REPOSITORY = Symbol('TransactionRepository');
