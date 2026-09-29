import type { TransactionType } from '@sol-a-sol/domain';

/**
 * Lo que el presupuesto necesita saber de una categoría, sin conocer las tablas de `catalog`. Lo
 * cumple `CatalogLookup`, de su API pública.
 *
 * **Exige el `userId`**: `null` si no existe **o es de otra cuenta**.
 */
export interface BudgetCatalogReader {
  category(
    userId: string,
    id: string,
  ): Promise<{ type: TransactionType; archived: boolean; parentId: string | null } | null>;
}

export const BUDGET_CATALOG_READER = Symbol('BudgetCatalogReader');
