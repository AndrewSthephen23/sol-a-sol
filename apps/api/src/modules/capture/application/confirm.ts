import { Inject, Injectable } from '@nestjs/common';
import {
  CaptureNotPendingError,
  type Clock,
  DomainError,
  searchKey,
  today,
  transactionFromCapture,
} from '@sol-a-sol/domain';

import { CLOCK } from '../../../shared/time/system-clock.js';
import { CaptureMerchantMissingError, CaptureNotFoundError } from '../domain/errors.js';
import {
  type Capture,
  CAPTURE_REPOSITORY,
  type CaptureRepository,
} from '../ports/capture-repository.js';
import {
  CATEGORIZATION_RULE_REPOSITORY,
  type CategorizationRuleRepository,
} from '../ports/categorization-rule-repository.js';
import {
  CAPTURE_TRANSACTIONS_WRITER,
  type CaptureTransactionsWriter,
} from '../ports/transactions-writer.js';

/** La bandeja: por revisar y duplicadas. */
const INBOX = ['PENDING', 'DUPLICATE'] as const;

/** Una captura confirmada: siempre con su transacción. */
export type ConfirmedCapture = Capture & { transactionId: string };

export interface ConfirmOptions {
  /** «Recordar para este comercio» (decisión 13): crea o actualiza su regla. */
  rememberCategory: boolean;
}

/**
 * Confirma una captura de la bandeja: arma su transacción (`transactionFromCapture`) y la
 * registra por la escritura pública de `transactions`, que aplica las reglas de toda transacción.
 * La captura pasa a confirmada con su `transactionId`, y su texto crudo se borra (decisión 14).
 *
 * **Una sola transacción por captura**, aunque lleguen dos confirmaciones a la vez: la base no
 * deja una segunda (`transactions.capture_id` único) y el cambio de estado lleva el estado
 * esperado en el `UPDATE`. La que pierde responde 409 (decidido el 2026-10-04). Si una
 * confirmación se cortó después de crear la transacción, la siguiente la enlaza.
 */
@Injectable()
export class ConfirmCapture {
  constructor(
    @Inject(CAPTURE_REPOSITORY) private readonly captures: CaptureRepository,
    @Inject(CATEGORIZATION_RULE_REPOSITORY) private readonly rules: CategorizationRuleRepository,
    @Inject(CAPTURE_TRANSACTIONS_WRITER) private readonly writer: CaptureTransactionsWriter,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(userId: string, id: string, options: ConfirmOptions): Promise<ConfirmedCapture> {
    const capture = await this.captures.find(userId, id);
    if (capture === null) throw new CaptureNotFoundError();

    const draft = transactionFromCapture(
      { ...capture, date: capture.businessDate },
      today(this.clock),
    );
    // Se revisa antes de registrar nada: sin comercio no hay regla que recordar (2026-10-04).
    if (options.rememberCategory && draft.merchant === null) {
      throw new CaptureMerchantMissingError();
    }

    const { transactionId } = await this.writer.recordFromCapture(userId, {
      ...draft,
      captureId: id,
    });
    const confirmed = await this.captures.update(
      userId,
      id,
      { status: 'CONFIRMED', transactionId },
      INBOX,
    );
    if (confirmed === null) throw new CaptureNotPendingError();

    if (options.rememberCategory && draft.merchant !== null) {
      await this.rules.remember(userId, {
        pattern: draft.merchant,
        patternKey: searchKey(draft.merchant),
        categoryId: draft.categoryId,
      });
    }
    return { ...confirmed, transactionId };
  }
}

export interface ConfirmCapturesResult {
  confirmed: { id: string; transactionId: string }[];
  /** Las que no se pudieron confirmar, con el `code` de su error. */
  failed: { id: string; code: string }[];
}

/**
 * «Confirmar las 5 completas» (decisión 10): **cada una por su lado** (decidido el 2026-10-04).
 * Una que no se puede confirmar no frena a las demás: queda en `failed` con su `code`. Un error
 * inesperado (la base caída) sí corta, y las ya confirmadas quedan confirmadas.
 */
@Injectable()
export class ConfirmCaptures {
  constructor(private readonly confirmCapture: ConfirmCapture) {}

  async execute(
    userId: string,
    items: readonly ({ id: string } & ConfirmOptions)[],
  ): Promise<ConfirmCapturesResult> {
    const result: ConfirmCapturesResult = { confirmed: [], failed: [] };

    for (const { id, rememberCategory } of items) {
      try {
        const capture = await this.confirmCapture.execute(userId, id, { rememberCategory });
        result.confirmed.push({ id, transactionId: capture.transactionId });
      } catch (error) {
        if (!(error instanceof DomainError)) throw error;
        result.failed.push({ id, code: error.code });
      }
    }
    return result;
  }
}
