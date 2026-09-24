import type { Currency, PaymentMethodKind } from '@sol-a-sol/domain';

/** Todo lo que se guarda de un método de pago. No hay más: ni número completo, ni CVV, ni vencimiento. */
export interface PaymentMethod {
  id: string;
  kind: PaymentMethodKind;
  alias: string;
  institution: string | null;
  last4: string | null;
  currency: Currency | null;
  archivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface NewPaymentMethod {
  userId: string;
  kind: PaymentMethodKind;
  alias: string;
  institution: string | null;
  last4: string | null;
  currency: Currency | null;
}

/** Lo que se puede cambiar. El tipo no está: no se cambia. */
export interface PaymentMethodChanges {
  alias?: string;
  institution?: string | null;
  last4?: string | null;
  currency?: Currency | null;
  archivedAt?: Date | null;
}

/**
 * Todo método **exige el `userId`**, y va dentro del `WHERE`: no existe forma de leer o cambiar
 * un método de pago sin decir de quién es, así que olvidar el filtro no compila.
 */
export interface PaymentMethodRepository {
  /** Lanza `PaymentMethodAliasTakenError` si el alias ya existe. */
  create(method: NewPaymentMethod): Promise<PaymentMethod>;

  /** Ordenados por alias. Sin los archivados, salvo que se pidan. */
  list(userId: string, options: { includeArchived: boolean }): Promise<PaymentMethod[]>;

  /** `null` si no existe **o es de otra cuenta**. */
  find(userId: string, id: string): Promise<PaymentMethod | null>;

  /**
   * `null` si no existe o es de otra cuenta. Lanza `PaymentMethodAliasTakenError` si el alias
   * nuevo ya existe.
   */
  update(userId: string, id: string, changes: PaymentMethodChanges): Promise<PaymentMethod | null>;
}

/** Token de inyección: en TypeScript una interfaz no existe en tiempo de ejecución. */
export const PAYMENT_METHOD_REPOSITORY = Symbol('PaymentMethodRepository');
