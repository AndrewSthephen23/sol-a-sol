import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';

import { PERU_TIME_ZONE } from '@sol-a-sol/domain';

import { PurgeDiscardedCaptures } from '../application/inbox.js';

/**
 * Una vez al día, de madrugada en Lima, borra del todo las capturas descartadas hace más de 90
 * días (decisión 11). Corre dentro de la API (decidido el 2026-10-04): se cumple aunque nadie abra
 * la bandeja, que es lo que pide la privacidad del texto crudo.
 */
@Injectable()
export class DiscardedCapturesPurgeJob {
  private readonly logger = new Logger(DiscardedCapturesPurgeJob.name);

  constructor(private readonly purge: PurgeDiscardedCaptures) {}

  @Cron('0 30 4 * * *', { name: 'purge-discarded-captures', timeZone: PERU_TIME_ZONE })
  async run(): Promise<void> {
    try {
      const deleted = await this.purge.execute();
      if (deleted > 0) this.logger.log(`Deleted ${String(deleted)} discarded captures for good.`);
    } catch (error) {
      // Un fallo no tumba la API: mañana vuelve a intentarlo.
      this.logger.error(
        `Could not delete the old discarded captures: ${error instanceof Error ? error.message : 'unknown error'}`,
      );
    }
  }
}
