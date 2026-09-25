import type { Currency, TransactionType } from '@sol-a-sol/domain';

/**
 * Lo que `transactions` necesita saber del catálogo, sin conocer sus tablas. Lo cumple
 * `CatalogLookup`, de la API pública de `catalog`.
 *
 * Cada consulta **exige el `userId`**: `null` si no existe **o es de otra cuenta**.
 */
export interface CatalogReader {
  category(
    userId: string,
    id: string,
  ): Promise<{ type: TransactionType; archived: boolean } | null>;

  /** La categoría y sus subcategorías (archivadas incluidas), o `null`. */
  categoryFamily(userId: string, id: string): Promise<string[] | null>;

  paymentMethod(
    userId: string,
    id: string,
  ): Promise<{ currency: Currency | null; archived: boolean } | null>;
}

export const CATALOG_READER = Symbol('CatalogReader');
