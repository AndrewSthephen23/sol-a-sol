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

/**
 * Todo método **exige el `userId`**, y va dentro del `WHERE`: no existe forma de leer una
 * transacción sin decir de quién es. Las borradas no aparecen en las consultas normales.
 */
export interface TransactionRepository {
  create(transaction: NewTransaction): Promise<Transaction>;

  /** `null` si no existe, **es de otra cuenta o está borrada**. */
  find(userId: string, id: string): Promise<Transaction | null>;
}

/** Token de inyección: en TypeScript una interfaz no existe en tiempo de ejecución. */
export const TRANSACTION_REPOSITORY = Symbol('TransactionRepository');
