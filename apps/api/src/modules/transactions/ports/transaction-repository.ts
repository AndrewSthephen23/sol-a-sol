import type {
  Currency,
  LocalDate,
  Money,
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
}

/** Qué transacciones listar. Todo opcional; sin nada, todas las vigentes de la cuenta. */
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

  /** Deshace el borrado. `false` si no estaba borrada, no existe o es de otra cuenta. */
  restore(userId: string, id: string): Promise<boolean>;
}

/** Token de inyección: en TypeScript una interfaz no existe en tiempo de ejecución. */
export const TRANSACTION_REPOSITORY = Symbol('TransactionRepository');
