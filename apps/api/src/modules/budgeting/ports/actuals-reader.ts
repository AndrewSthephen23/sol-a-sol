import type { LocalDate, Money, TransactionType } from '@sol-a-sol/domain';

/**
 * Lo real de un mes, sin conocer las tablas de `transactions`. Lo cumple `TransactionsLookup`, de
 * su API pública: solo transacciones vigentes, sin transferencias, por categoría (la de cada
 * transacción, sin subir a su madre), tipo y moneda. **Exige el `userId`.**
 */
export interface BudgetActualsReader {
  totalsByCategory(
    userId: string,
    from: LocalDate,
    to: LocalDate,
  ): Promise<{ categoryId: string; type: TransactionType; amount: Money }[]>;
}

export const BUDGET_ACTUALS_READER = Symbol('BudgetActualsReader');
