/**
 * Eventos que publica `transactions`. Son parte de su API pública (`index.ts`): el presupuesto,
 * las tarjetas y los resúmenes los escucharán sin importar nada más de aquí (ADR-0004).
 *
 * Llevan solo ids: quien necesite la transacción la pide por la API pública del módulo.
 */

/** Se registró una transacción. */
export const TRANSACTION_CREATED = 'transactions.transaction.created';

export interface TransactionCreated {
  userId: string;
  transactionId: string;
}

/** Se corrigió una transacción: cualquier campo, incluidos su monto, fecha o tipo. */
export const TRANSACTION_UPDATED = 'transactions.transaction.updated';

/** Se borró una transacción (borrado lógico): deja de contar. */
export const TRANSACTION_DELETED = 'transactions.transaction.deleted';

/**
 * Se deshizo el borrado de una transacción: vuelve a contar. Se anuncia para que quien lleve una
 * cuenta con los otros tres eventos no se desincronice.
 */
export const TRANSACTION_RESTORED = 'transactions.transaction.restored';

/** Los cuatro eventos llevan lo mismo: de quién y cuál. */
export type TransactionUpdated = TransactionCreated;
export type TransactionDeleted = TransactionCreated;
export type TransactionRestored = TransactionCreated;

/** Se registró una transferencia entre dos cuentas propias. */
export const TRANSFER_CREATED = 'transactions.transfer.created';

export interface TransferCreated {
  userId: string;
  transferId: string;
}

/** Se corrigió una transferencia. */
export const TRANSFER_UPDATED = 'transactions.transfer.updated';

/** Se borró una transferencia (borrado lógico). */
export const TRANSFER_DELETED = 'transactions.transfer.deleted';

/** Se deshizo el borrado de una transferencia. */
export const TRANSFER_RESTORED = 'transactions.transfer.restored';

/** Los cuatro eventos de transferencias llevan lo mismo: de quién y cuál. */
export type TransferUpdated = TransferCreated;
export type TransferDeleted = TransferCreated;
export type TransferRestored = TransferCreated;
