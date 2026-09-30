import type { CreditCardSettings } from '@sol-a-sol/domain';

/** Una tarjeta guardada: el método de pago que configura y su configuración. */
export interface CreditCard extends CreditCardSettings {
  id: string;
  paymentMethodId: string;
}

/**
 * Las tarjetas, siempre de una cuenta: cada método **exige el `userId`**, que va dentro de la
 * consulta, nunca en una comprobación aparte.
 */
export interface CreditCardRepository {
  /** En el orden en que se configuraron. */
  list(userId: string): Promise<CreditCard[]>;

  /** `null` si no existe **o es de otra cuenta**. */
  find(userId: string, id: string): Promise<CreditCard | null>;

  /** Lanza `CreditCardAlreadyConfiguredError` si el método ya está configurado. */
  create(
    userId: string,
    paymentMethodId: string,
    settings: CreditCardSettings,
  ): Promise<CreditCard>;

  /** Reemplaza la configuración entera. `null` si no existe o es de otra cuenta. */
  update(userId: string, id: string, settings: CreditCardSettings): Promise<CreditCard | null>;
}

export const CREDIT_CARD_REPOSITORY = Symbol('CreditCardRepository');
