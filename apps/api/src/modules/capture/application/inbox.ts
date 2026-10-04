import { Inject, Injectable } from '@nestjs/common';
import {
  assertCategoryUsable,
  assertInInbox,
  assertPaymentMethodUsable,
  assertTransactionDate,
  type CaptureCorrection,
  CaptureNotDiscardedError,
  CaptureNotPendingError,
  type Clock,
  correctCapture,
  discardCapture,
  discardedPurgeCutoff,
  restoreCapture,
  today,
} from '@sol-a-sol/domain';

import { CLOCK } from '../../../shared/time/system-clock.js';
import {
  CaptureCategoryNotFoundError,
  CaptureNotFoundError,
  CapturePaymentMethodNotFoundError,
} from '../domain/errors.js';
import {
  CAPTURE_ACCOUNTS_READER,
  CAPTURE_FEATURE_FLAGS,
  type CaptureAccountsReader,
  type CaptureFeatureFlags,
} from '../ports/accounts-reader.js';
import {
  type Capture,
  type CapturePosition,
  CAPTURE_REPOSITORY,
  type CaptureRepository,
} from '../ports/capture-repository.js';
import { CAPTURE_CATALOG_READER, type CaptureCatalogReader } from '../ports/catalog-reader.js';

/** La bandeja: por revisar y duplicadas. */
const INBOX = ['PENDING', 'DUPLICATE'] as const;

export interface CapturePage {
  captures: Capture[];
  /** Dónde sigue la siguiente página; `null` si esta fue la última. */
  next: CapturePosition | null;
}

/**
 * La bandeja (`inbox`: por revisar, con las duplicadas marcadas) o las descartadas, primero la
 * más reciente. Las confirmadas no se listan: ya son transacciones (decidido el 2026-10-04).
 */
@Injectable()
export class ListCaptures {
  constructor(@Inject(CAPTURE_REPOSITORY) private readonly captures: CaptureRepository) {}

  async execute(
    userId: string,
    query: { status: 'inbox' | 'discarded'; after: CapturePosition | null; limit: number },
  ): Promise<CapturePage> {
    const statuses = query.status === 'inbox' ? INBOX : (['DISCARDED'] as const);
    // Una de más para saber si hay otra página sin contar todas.
    const found = await this.captures.list(userId, statuses, {
      after: query.after,
      limit: query.limit + 1,
    });
    const captures = found.slice(0, query.limit);
    const last = captures.at(-1);

    return {
      captures,
      next:
        found.length > query.limit && last !== undefined
          ? { occurredAt: last.occurredAt, id: last.id }
          : null,
    };
  }
}

/** Una captura de la cuenta, con su pedido crudo mientras no se confirme (decisión 14). */
@Injectable()
export class GetCapture {
  constructor(@Inject(CAPTURE_REPOSITORY) private readonly captures: CaptureRepository) {}

  async execute(userId: string, id: string): Promise<Capture> {
    return findCapture(this.captures, userId, id);
  }
}

/**
 * Corrige una captura de la bandeja (decisión 10: todo se corrige). La marca de duplicada se
 * queda: dice cómo llegó. Una categoría o un método **nuevos** tienen que ser de la cuenta y estar
 * activos, y la categoría del tipo de la captura; la fecha, hasta hoy, como una transacción. Si el
 * monto no tiene moneda y el método elegido tiene una sola, toma esa (decisión 3).
 */
@Injectable()
export class CorrectCapture {
  constructor(
    @Inject(CAPTURE_REPOSITORY) private readonly captures: CaptureRepository,
    @Inject(CAPTURE_CATALOG_READER) private readonly catalog: CaptureCatalogReader,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(userId: string, id: string, correction: CaptureCorrection): Promise<Capture> {
    const capture = await findCapture(this.captures, userId, id);
    assertInInbox(capture.status);
    const fields = correctCapture({ ...capture, date: capture.businessDate }, correction);
    assertTransactionDate(fields.date, today(this.clock));

    const typeChanged = fields.type !== capture.type;
    if (fields.categoryId !== null && (fields.categoryId !== capture.categoryId || typeChanged)) {
      const category = await this.catalog.category(userId, fields.categoryId);
      if (category === null) throw new CaptureCategoryNotFoundError();
      assertCategoryUsable(category, fields.type);
    }

    let { amount } = fields;
    if (fields.paymentMethodId !== null && fields.paymentMethodId !== capture.paymentMethodId) {
      const method = await this.catalog.paymentMethod(userId, fields.paymentMethodId);
      if (method === null) throw new CapturePaymentMethodNotFoundError();
      assertPaymentMethodUsable(method);
      if (amount !== null && amount.currency === null) {
        amount = { ...amount, currency: method.currency };
      }
    }

    const { date, ...changes } = fields;
    const updated = await this.captures.update(
      userId,
      id,
      { ...changes, amount, businessDate: date },
      [capture.status],
    );
    if (updated === null) throw new CaptureNotPendingError();

    return updated;
  }
}

/** Descarta una captura de la bandeja, recordando de dónde vino (decisión 11). */
@Injectable()
export class DiscardCapture {
  constructor(
    @Inject(CAPTURE_REPOSITORY) private readonly captures: CaptureRepository,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(userId: string, id: string): Promise<Capture> {
    const capture = await findCapture(this.captures, userId, id);
    const state = discardCapture(capture.status, this.clock.now());

    const updated = await this.captures.update(userId, id, state, [capture.status]);
    if (updated === null) throw new CaptureNotPendingError();

    return updated;
  }
}

/** «Deshacer»: la descartada vuelve a la bandeja como estaba (decidido el 2026-10-04). */
@Injectable()
export class RestoreCapture {
  constructor(@Inject(CAPTURE_REPOSITORY) private readonly captures: CaptureRepository) {}

  async execute(userId: string, id: string): Promise<Capture> {
    const capture = await findCapture(this.captures, userId, id);
    const state = restoreCapture(capture.status, capture.discardedFrom);

    const updated = await this.captures.update(userId, id, state, ['DISCARDED']);
    if (updated === null) throw new CaptureNotDiscardedError();

    return updated;
  }
}

/**
 * Borra del todo las descartadas hace más de 90 días, con su texto crudo (decisiones 11 y 14),
 * cuenta por cuenta: el repositorio nunca consulta sin `userId`. Con el módulo apagado no hace
 * nada. Devuelve cuántas borró.
 */
@Injectable()
export class PurgeDiscardedCaptures {
  constructor(
    @Inject(CAPTURE_REPOSITORY) private readonly captures: CaptureRepository,
    @Inject(CAPTURE_ACCOUNTS_READER) private readonly accounts: CaptureAccountsReader,
    @Inject(CAPTURE_FEATURE_FLAGS) private readonly flags: CaptureFeatureFlags,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(): Promise<number> {
    if (!this.flags.isEnabled('capture')) return 0;
    const cutoff = discardedPurgeCutoff(this.clock.now());
    let deleted = 0;

    for (const userId of await this.accounts.execute()) {
      deleted += await this.captures.deleteDiscardedBefore(userId, cutoff);
    }
    return deleted;
  }
}

async function findCapture(
  captures: CaptureRepository,
  userId: string,
  id: string,
): Promise<Capture> {
  const capture = await captures.find(userId, id);
  if (capture === null) throw new CaptureNotFoundError();
  return capture;
}
