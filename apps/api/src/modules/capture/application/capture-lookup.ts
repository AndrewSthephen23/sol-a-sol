import { Inject, Injectable } from '@nestjs/common';
import { type LocalDate, Money } from '@sol-a-sol/domain';

import { CAPTURE_REPOSITORY, type CaptureRepository } from '../ports/capture-repository.js';

/** Una captura que espera en la bandeja, con lo mínimo para el resumen. */
export interface PendingCaptureReference {
  /** Su día en Lima. */
  date: LocalDate;
  /** Nulo si no tiene monto o no tiene moneda: se cuenta, pero no suma. */
  amount: Money | null;
}

/**
 * Lo que `capture` ofrece a otros módulos por su API pública (`index.ts`), para que no lean sus
 * tablas. Hoy lo usa el **resumen mensual** de `reports` (decisión 16 de H7). Exige el `userId`.
 */
@Injectable()
export class CaptureLookup {
  constructor(@Inject(CAPTURE_REPOSITORY) private readonly captures: CaptureRepository) {}

  /**
   * Las que esperan en la bandeja (por revisar y duplicadas, como el contador; decidido el
   * 2026-10-04) con su día entre esos dos, incluidos.
   */
  async pendingCaptures(
    userId: string,
    from: LocalDate,
    to: LocalDate,
  ): Promise<PendingCaptureReference[]> {
    const captures = await this.captures.listInboxBetween(userId, from, to);

    return captures.map(({ businessDate, amount }) => ({
      date: businessDate,
      amount: amount?.currency == null ? null : Money.of(amount.value, amount.currency),
    }));
  }
}
