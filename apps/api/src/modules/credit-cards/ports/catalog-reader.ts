import type { Currency, PaymentMethodKind } from '@sol-a-sol/domain';

/** Lo que identifica una tarjeta: alias, banco y últimos 4. Nunca más. */
export interface CardPaymentMethod {
  id: string;
  kind: PaymentMethodKind;
  alias: string;
  institution: string | null;
  last4: string | null;
  /** Nula = bimoneda: acepta soles y dólares. */
  currency: Currency | null;
  archived: boolean;
}

/**
 * Lo que las tarjetas necesitan saber de los métodos de pago, sin conocer las tablas de
 * `catalog`. Lo cumple `CatalogLookup`, de su API pública.
 *
 * **Exige el `userId`**: `null` si no existe **o es de otra cuenta**.
 */
export interface CreditCardCatalogReader {
  paymentMethod(
    userId: string,
    id: string,
  ): Promise<{ kind: PaymentMethodKind; currency: Currency | null; archived: boolean } | null>;

  /** Todos los de la cuenta, archivados incluidos: una tarjeta archivada se sigue viendo. */
  allPaymentMethods(userId: string): Promise<CardPaymentMethod[]>;
}

export const CREDIT_CARD_CATALOG_READER = Symbol('CreditCardCatalogReader');
