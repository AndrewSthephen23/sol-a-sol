import type { LocalDate, Money, TransactionType } from '@sol-a-sol/domain';

/** Una transacción vigente, como está hoy: lo que un aporte enlazado sigue. */
export interface GoalTransaction {
  id: string;
  date: LocalDate;
  type: TransactionType;
  amount: Money;
  description: string;
}

/**
 * Las transacciones que siguen los aportes enlazados, sin conocer las tablas de `transactions`. Lo
 * cumple `TransactionsLookup`, de su API pública.
 *
 * **Exige el `userId`**: las transacciones de otra cuenta nunca aparecen.
 */
export interface GoalTransactionsReader {
  /** Las vigentes de la cuenta con esos ids: las borradas y las ajenas no aparecen. */
  liveTransactions(userId: string, ids: readonly string[]): Promise<GoalTransaction[]>;
}

export const GOAL_TRANSACTIONS_READER = Symbol('GoalTransactionsReader');
