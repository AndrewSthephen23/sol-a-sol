import type { LocalDate, Money, TransactionType } from '@sol-a-sol/domain';

/**
 * Lo real de un rango de fechas, sin conocer las tablas de `transactions`. Lo cumple
 * `TransactionsLookup`, de su API pública: vigentes, sin transferencias. **Exige el `userId`.**
 */
export interface ReportActualsReader {
  totalsByCategory(
    userId: string,
    from: LocalDate,
    to: LocalDate,
  ): Promise<{ categoryId: string; type: TransactionType; amount: Money }[]>;

  totalsByDay(
    userId: string,
    from: LocalDate,
    to: LocalDate,
  ): Promise<{ date: LocalDate; type: TransactionType; amount: Money }[]>;
}

/** Las categorías de la cuenta, para subir lo de una hija a su madre. Lo cumple `CatalogLookup`. */
export interface ReportCatalogReader {
  allCategories(userId: string): Promise<{ id: string; parentId: string | null }[]>;
}

export const REPORT_ACTUALS_READER = Symbol('ReportActualsReader');
export const REPORT_CATALOG_READER = Symbol('ReportCatalogReader');
