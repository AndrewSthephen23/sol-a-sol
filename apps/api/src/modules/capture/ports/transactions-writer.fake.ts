import type { CaptureTransactionDraft, CaptureTransactionsWriter } from './transactions-writer.js';

/** Transacciones registradas en memoria, una por captura, como la base. */
export class FakeCaptureTransactionsWriter implements CaptureTransactionsWriter {
  readonly recorded: { userId: string; transactionId: string; draft: CaptureTransactionDraft }[] =
    [];

  recordFromCapture(
    userId: string,
    draft: CaptureTransactionDraft,
  ): Promise<{ transactionId: string; created: boolean }> {
    const existing = this.recorded.find((entry) => entry.draft.captureId === draft.captureId);
    if (existing !== undefined) {
      return Promise.resolve({ transactionId: existing.transactionId, created: false });
    }
    const transactionId = `transaction-${String(this.recorded.length + 1)}`;
    this.recorded.push({ userId, transactionId, draft });
    return Promise.resolve({ transactionId, created: true });
  }
}
