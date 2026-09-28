import type { Currency, PaymentMethodKind, TransactionType } from '@sol-a-sol/domain';

/**
 * Lo que la importación escribe en el catálogo, sin conocer sus tablas: lo cumple la API pública
 * de `catalog` (sus casos de uso de crear y restaurar), con las mismas reglas que a mano.
 */
export interface CatalogWriter {
  /** Devuelve el id de la categoría creada. */
  createCategory(
    userId: string,
    category: { type: TransactionType; name: string; parentId: string | null },
  ): Promise<string>;

  /** La restaura junto con las hijas que se archivaron con ella. */
  restoreCategory(userId: string, id: string): Promise<void>;

  /** Devuelve el id del método creado. */
  createPaymentMethod(
    userId: string,
    method: {
      kind: PaymentMethodKind;
      alias: string;
      institution: string | null;
      last4: string | null;
      currency: Currency | null;
    },
  ): Promise<string>;

  restorePaymentMethod(userId: string, id: string): Promise<void>;
}

export const CATALOG_WRITER = Symbol('CatalogWriter');
