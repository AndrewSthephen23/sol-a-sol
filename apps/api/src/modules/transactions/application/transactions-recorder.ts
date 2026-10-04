import { Inject, Injectable } from '@nestjs/common';
import type { LocalDate, Money, TransactionType } from '@sol-a-sol/domain';

import {
  CaptureAlreadyRecordedError,
  TRANSACTION_REPOSITORY,
  type TransactionRepository,
} from '../ports/transaction-repository.js';
import { CreateTransaction } from './transactions.js';

/** La transacción que sale de confirmar una captura del teléfono. */
export interface CapturedTransaction {
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

export interface RecordedTransaction {
  transactionId: string;
  /** `false` si la captura ya tenía su transacción: se devuelve esa, sin crear otra. */
  created: boolean;
}

/**
 * La escritura pública de `transactions` (H7): lo que otro módulo usa para **registrar** una
 * transacción sin importar su interior. Hoy la usa `capture` al confirmar una captura de la
 * bandeja, detrás de un puerto propio.
 *
 * Pasa por `CreateTransaction`, así que se aplican todas las reglas de una transacción (fecha
 * hasta hoy, monto positivo, categoría de la cuenta, activa y del tipo, método activo) y se emite
 * `TransactionCreated`. **Una captura da una sola transacción**: si ya la tiene (dos
 * confirmaciones a la vez, o una que se cortó después de crearla), devuelve esa, aunque se haya
 * borrado después.
 */
@Injectable()
export class TransactionsRecorder {
  constructor(
    private readonly createTransaction: CreateTransaction,
    @Inject(TRANSACTION_REPOSITORY) private readonly transactions: TransactionRepository,
  ) {}

  async recordFromCapture(
    userId: string,
    captured: CapturedTransaction,
  ): Promise<RecordedTransaction> {
    try {
      const created = await this.createTransaction.execute({
        userId,
        date: captured.date.toString(),
        type: captured.type,
        categoryId: captured.categoryId,
        amount: captured.amount.toFixed(),
        currency: captured.amount.currency,
        description: captured.description,
        paymentMethodId: captured.paymentMethodId,
        merchant: captured.merchant,
        source: captured.source,
        captureId: captured.captureId,
      });
      return { transactionId: created.id, created: true };
    } catch (error) {
      if (!(error instanceof CaptureAlreadyRecordedError)) throw error;
      const existing = await this.transactions.findIdByCapture(userId, captured.captureId);
      if (existing === null) throw error;
      return { transactionId: existing, created: false };
    }
  }
}
