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

  /** Todas las categorías de la cuenta, archivadas incluidas: la importación las busca por nombre. */
  allCategories(userId: string): Promise<CatalogCategory[]>;

  /** Todos los métodos de pago de la cuenta, archivados incluidos: la importación los busca por alias. */
  allPaymentMethods(userId: string): Promise<CatalogPaymentMethod[]>;
}

export interface CatalogCategory {
  id: string;
  name: string;
  type: TransactionType;
  parentId: string | null;
  archived: boolean;
}

export interface CatalogPaymentMethod {
  id: string;
  alias: string;
  currency: Currency | null;
  archived: boolean;
}

export const CATALOG_READER = Symbol('CatalogReader');
