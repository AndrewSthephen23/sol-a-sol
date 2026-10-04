import type { Currency, TransactionType } from '@sol-a-sol/domain';

/** Lo que una captura necesita de un método de pago para reconocerlo y tomar su moneda. */
export interface CaptureCatalogPaymentMethod {
  id: string;
  alias: string;
  last4: string | null;
  /** Nula = bimoneda. */
  currency: Currency | null;
  archived: boolean;
}

/** Lo que una regla necesita saber de su categoría. */
export interface CaptureCatalogCategory {
  id: string;
  type: TransactionType;
  archived: boolean;
}

/** Lo que hace falta para usar una categoría elegida en la bandeja. */
export interface CaptureCategoryReference {
  type: TransactionType;
  archived: boolean;
}

/** Lo que hace falta para usar un método elegido en la bandeja. */
export interface CapturePaymentMethodReference {
  currency: Currency | null;
  archived: boolean;
}

/**
 * Los métodos de pago y categorías de la cuenta, sin conocer las tablas de `catalog`. Lo cumple
 * `CatalogLookup`, de su API pública. **Exige el `userId`**.
 */
export interface CaptureCatalogReader {
  /** Todos, archivados incluidos: quien lee decide. */
  allPaymentMethods(userId: string): Promise<CaptureCatalogPaymentMethod[]>;
  /** Todas, archivadas incluidas. */
  allCategories(userId: string): Promise<CaptureCatalogCategory[]>;
  /** `null` si no existe **o es de otra cuenta**. */
  category(userId: string, id: string): Promise<CaptureCategoryReference | null>;
  /** `null` si no existe **o es de otra cuenta**. */
  paymentMethod(userId: string, id: string): Promise<CapturePaymentMethodReference | null>;
}

export const CAPTURE_CATALOG_READER = Symbol('CaptureCatalogReader');
