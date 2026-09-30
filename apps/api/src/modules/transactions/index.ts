// API pública del módulo transactions.
// Otros módulos solo pueden importar desde aquí, nunca de sus carpetas internas.
export { TransactionsModule } from './transactions.module.js';
export {
  type CategoryTotal,
  type DayTotal,
  type PaymentMethodDayTotal,
  type PaymentMethodMovementKind,
  TransactionsLookup,
} from './application/transactions-lookup.js';
export {
  TRANSACTION_CREATED,
  TRANSACTION_DELETED,
  TRANSACTION_RESTORED,
  TRANSACTION_UPDATED,
  TRANSFER_CREATED,
  TRANSFER_DELETED,
  TRANSFER_RESTORED,
  TRANSFER_UPDATED,
  type TransactionCreated,
  type TransactionDeleted,
  type TransactionRestored,
  type TransactionUpdated,
  type TransferCreated,
  type TransferDeleted,
  type TransferRestored,
  type TransferUpdated,
} from './domain/events.js';
