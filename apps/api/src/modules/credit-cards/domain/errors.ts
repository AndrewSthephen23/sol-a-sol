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

/** El plan de cuotas no existe, es de otra tarjeta o de otra cuenta (404). */
export class InstallmentPlanNotFoundError extends DomainError {
  readonly code = 'INSTALLMENT_PLAN_NOT_FOUND';

  constructor() {
    super('Installment plan not found.');
  }
}

/** Una compra, a lo más un plan: el segundo choca con el que ya existe (409). */
export class InstallmentPlanAlreadyExistsError extends DomainError {
  readonly code = 'INSTALLMENT_PLAN_ALREADY_EXISTS';

  constructor() {
    super('The purchase is already paid in installments: undo that plan first.');
  }
}

/**
 * La compra no existe, está borrada o es de otra cuenta. Mismo código que en `transactions`: para
 * quien llama es el mismo error (404).
 */
export class InstallmentPurchaseNotFoundError extends DomainError {
  readonly code = 'TRANSACTION_NOT_FOUND';

  constructor() {
    super('Transaction not found.');
  }
}
