import type { LocalDate, Money } from '@sol-a-sol/domain';

/** Una transacción vigente de un día, para saber si una captura ya se registró. */
export interface CaptureDayTransaction {
  id: string;
  date: LocalDate;
  amount: Money;
  merchant: string | null;
  description: string;
}

/**
 * Las transacciones de un día, sin conocer las tablas de `transactions`. Lo cumple
 * `TransactionsLookup`, de su API pública. **Exige el `userId`**.
 */
export interface CaptureTransactionsReader {
  /** Las vigentes de la cuenta en ese día: las borradas y las ajenas no aparecen. */
  liveTransactionsOn(userId: string, date: LocalDate): Promise<CaptureDayTransaction[]>;
}

export const CAPTURE_TRANSACTIONS_READER = Symbol('CaptureTransactionsReader');
