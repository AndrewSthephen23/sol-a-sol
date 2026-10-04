import type { LocalDate } from '@sol-a-sol/domain';

import type { CaptureDayTransaction, CaptureTransactionsReader } from './transactions-reader.js';

/** Transacciones vigentes en memoria, por cuenta. */
export class FakeCaptureTransactionsReader implements CaptureTransactionsReader {
  readonly transactions: { userId: string; transaction: CaptureDayTransaction }[] = [];

  liveTransactionsOn(userId: string, date: LocalDate): Promise<CaptureDayTransaction[]> {
    return Promise.resolve(
      this.transactions
        .filter((entry) => entry.userId === userId && entry.transaction.date.equals(date))
        .map((entry) => entry.transaction),
    );
  }
}
