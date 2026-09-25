// API pública del módulo transactions.
// Otros módulos solo pueden importar desde aquí, nunca de sus carpetas internas.
export { TransactionsModule } from './transactions.module.js';
export {
  TRANSACTION_CREATED,
  TRANSACTION_DELETED,
  TRANSACTION_RESTORED,
  TRANSACTION_UPDATED,
  type TransactionCreated,
  type TransactionDeleted,
  type TransactionRestored,
  type TransactionUpdated,
} from './domain/events.js';
