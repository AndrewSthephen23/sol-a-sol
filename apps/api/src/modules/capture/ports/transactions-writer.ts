import type { LocalDate, Money, TransactionType } from '@sol-a-sol/domain';

/** La transacción que sale de una captura confirmada. */
export interface CaptureTransactionDraft {
  captureId: string;
  date: LocalDate;
  type: TransactionType;
  categoryId: string;
  amount: Money;
  paymentMethodId: string | null;
  merchant: string | null;
  description: string;
  source: 'IOS_SHORTCUT' | 'ANDROID_AUTOMATION';
}

/**
 * Registrar la transacción de una captura sin conocer el interior de `transactions`. Lo cumple
 * `TransactionsRecorder`, de su API pública: aplica las reglas de toda transacción y, si la
 * captura ya tiene la suya, la devuelve sin crear otra. **Exige el `userId`**.
 */
export interface CaptureTransactionsWriter {
  recordFromCapture(
    userId: string,
    draft: CaptureTransactionDraft,
  ): Promise<{ transactionId: string; created: boolean }>;
}

export const CAPTURE_TRANSACTIONS_WRITER = Symbol('CaptureTransactionsWriter');
