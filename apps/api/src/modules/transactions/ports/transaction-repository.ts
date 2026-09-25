import type { LocalDate, Money, TransactionSource, TransactionType } from '@sol-a-sol/domain';

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

  /** Deshace el borrado. `false` si no estaba borrada, no existe o es de otra cuenta. */
  restore(userId: string, id: string): Promise<boolean>;
}

/** Token de inyección: en TypeScript una interfaz no existe en tiempo de ejecución. */
export const TRANSACTION_REPOSITORY = Symbol('TransactionRepository');
