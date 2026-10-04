import { DomainError } from '@sol-a-sol/domain';

/** No existe **o es de otra cuenta**: desde fuera no se distinguen. */
export class CaptureNotFoundError extends DomainError {
  readonly code = 'CAPTURE_NOT_FOUND';

  constructor() {
    super('The capture does not exist.');
  }
}

/** La categoría elegida en la bandeja no existe o es de otra cuenta. */
export class CaptureCategoryNotFoundError extends DomainError {
  readonly code = 'CATEGORY_NOT_FOUND';

  constructor() {
    super('The category does not exist.');
  }
}

/** El método elegido en la bandeja no existe o es de otra cuenta. */
export class CapturePaymentMethodNotFoundError extends DomainError {
  readonly code = 'PAYMENT_METHOD_NOT_FOUND';

  constructor() {
    super('The payment method does not exist.');
  }
}

/** «Recordar para este comercio» sin comercio: no hay con qué armar la regla (2026-10-04). */
export class CaptureMerchantMissingError extends DomainError {
  readonly code = 'CAPTURE_MERCHANT_MISSING';

  constructor() {
    super('The capture has no merchant to remember its category for.');
  }
}

/** No existe **o es de otra cuenta**. */
export class CategorizationRuleNotFoundError extends DomainError {
  readonly code = 'RULE_NOT_FOUND';

  constructor() {
    super('The categorization rule does not exist.');
  }
}

/** La cuenta ya tiene una regla con ese patrón, sin tildes ni mayúsculas (2026-10-04). */
export class CategorizationRulePatternTakenError extends DomainError {
  readonly code = 'RULE_PATTERN_TAKEN';

  constructor() {
    super('The account already has a rule with that pattern: edit that one.');
  }
}

export class InvalidCaptureCursorError extends DomainError {
  readonly code = 'INVALID_CURSOR';

  constructor() {
    super('The cursor is not valid: ask for the first page again.');
  }
}
