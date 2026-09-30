import { DomainError } from '@sol-a-sol/domain';

/** La tarjeta no existe o es de otra cuenta: para quien llama es lo mismo (404). */
export class CreditCardNotFoundError extends DomainError {
  readonly code = 'CREDIT_CARD_NOT_FOUND';

  constructor() {
    super('Credit card not found.');
  }
}

/**
 * El método de pago no existe o es de otra cuenta. Mismo código que el de `catalog` y
 * `transactions`: para quien llama es el mismo error, venga del módulo que venga (404).
 */
export class CreditCardPaymentMethodNotFoundError extends DomainError {
  readonly code = 'PAYMENT_METHOD_NOT_FOUND';

  constructor() {
    super('Payment method not found.');
  }
}

/** Una configuración por método de pago: la segunda choca con la que ya existe (409). */
export class CreditCardAlreadyConfiguredError extends DomainError {
  readonly code = 'CREDIT_CARD_ALREADY_CONFIGURED';

  constructor() {
    super('The payment method is already set up as a credit card: correct it instead.');
  }
}
