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
