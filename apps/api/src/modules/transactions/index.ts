// API pública del módulo transactions.
// Otros módulos solo pueden importar desde aquí, nunca de sus carpetas internas.
export { TransactionsModule } from './transactions.module.js';
export { TRANSACTION_CREATED, type TransactionCreated } from './domain/events.js';
