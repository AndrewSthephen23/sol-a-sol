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

/** No existe, **es de otra cuenta o está borrada**, igual que una transacción. */
export class TransferNotFoundError extends DomainError {
  readonly code = 'TRANSFER_NOT_FOUND';

  constructor() {
    super('Transfer not found.');
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

/**
 * El cursor no es uno que haya dado la API: está cortado, se armó a mano o es de otra versión.
 * Se vuelve a pedir la primera página.
 */
export class InvalidCursorError extends DomainError {
  readonly code = 'INVALID_CURSOR';

  constructor() {
    super('The cursor is not valid: ask for the first page again.');
  }
}

/** No existe **o es de otra cuenta**: desde fuera no se distinguen. */
export class TagNotFoundError extends DomainError {
  readonly code = 'TAG_NOT_FOUND';

  constructor() {
    super('Tag not found.');
  }
}

/**
 * Otra petición creó al mismo tiempo una etiqueta con ese nombre. Casi nunca pasa: volver a
 * intentarlo la fusiona con esa.
 */
export class TagNameTakenError extends DomainError {
  readonly code = 'TAG_NAME_TAKEN';

  constructor() {
    super('Another tag with that name was just created. Try again to merge them.');
  }
}

/** El archivo de importación pesa más de 1 MB (decidido con el autor el 2026-09-28). */
export class ImportFileTooLargeError extends DomainError {
  readonly code = 'IMPORT_FILE_TOO_LARGE';

  constructor() {
    super('The file is larger than 1 MB: split it and import it in parts.');
  }
}

/** El archivo de importación tiene más de 5 000 filas (decidido con el autor el 2026-09-28). */
export class ImportTooManyRowsError extends DomainError {
  readonly code = 'IMPORT_TOO_MANY_ROWS';

  constructor() {
    super('The file has more than 5000 rows: split it and import it in parts.');
  }
}
