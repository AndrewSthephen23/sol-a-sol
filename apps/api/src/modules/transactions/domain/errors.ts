import { DomainError } from '@sol-a-sol/domain';

/**
 * No existe, **es de otra cuenta o está borrada**: desde fuera no se distinguen, para que probar
 * ids no sirva para averiguar cuáles existen.
 */
export class TransactionNotFoundError extends DomainError {
  readonly code = 'TRANSACTION_NOT_FOUND';

  constructor() {
    super('Transaction not found.');
  }
}

/**
 * La categoría elegida no existe o es de otra cuenta. Mismo código que el de `catalog`: para quien
 * llama es el mismo error, venga de un módulo o del otro.
 */
export class CategoryNotFoundError extends DomainError {
  readonly code = 'CATEGORY_NOT_FOUND';

  constructor() {
    super('Category not found.');
  }
}

/** El método de pago elegido no existe o es de otra cuenta. Mismo código que el de `catalog`. */
export class PaymentMethodNotFoundError extends DomainError {
  readonly code = 'PAYMENT_METHOD_NOT_FOUND';

  constructor() {
    super('Payment method not found.');
  }
}
