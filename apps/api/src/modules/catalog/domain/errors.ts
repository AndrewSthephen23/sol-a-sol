import { DomainError } from '@sol-a-sol/domain';

/**
 * No existe **o es de otra cuenta**: desde fuera no se distinguen, para que probar ids no sirva
 * para averiguar cuáles existen.
 */
export class PaymentMethodNotFoundError extends DomainError {
  readonly code = 'PAYMENT_METHOD_NOT_FOUND';

  constructor() {
    super('Payment method not found.');
  }
}

/**
 * Ya hay un método con ese alias, sin distinguir mayúsculas. Cuenta los archivados: para volver
 * a usar un alias se restaura el archivado, y así su historial sigue junto.
 */
export class PaymentMethodAliasTakenError extends DomainError {
  readonly code = 'PAYMENT_METHOD_ALIAS_TAKEN';

  constructor() {
    super(
      'A payment method with that alias already exists. If it is archived, restore it instead.',
    );
  }
}

/** No existe **o es de otra cuenta**, sea la categoría pedida o la madre elegida. */
export class CategoryNotFoundError extends DomainError {
  readonly code = 'CATEGORY_NOT_FOUND';

  constructor() {
    super('Category not found.');
  }
}

/**
 * Ya hay una categoría hermana del mismo tipo con ese nombre, sin distinguir mayúsculas ni
 * acentos. Cuenta las archivadas: para volver a usar un nombre se restaura la archivada.
 */
export class CategoryNameTakenError extends DomainError {
  readonly code = 'CATEGORY_NAME_TAKEN';

  constructor() {
    super(
      'A sibling category of the same type already has that name. If it is archived, restore it instead.',
    );
  }
}
