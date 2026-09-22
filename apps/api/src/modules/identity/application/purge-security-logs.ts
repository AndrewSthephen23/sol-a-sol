import { Inject, Injectable } from '@nestjs/common';
import { auditLogCutoff, type Clock, FAILURE_MEMORY_HOURS } from '@sol-a-sol/domain';

import { CLOCK } from '../../../shared/time/system-clock.js';
import { AUDIT_LOG_CLEANER, type AuditLogCleaner } from '../ports/audit-log-cleaner.js';
import {
  LOGIN_THROTTLE_REPOSITORY,
  type LoginThrottleRepository,
} from '../ports/login-throttle-repository.js';

const MILLISECONDS_PER_HOUR = 60 * 60 * 1000;

export interface PurgedSecurityLogs {
  auditEntries: number;
  loginAttempts: number;
}

/**
 * Borra lo que ya no hay por qué guardar: entradas de bitácora de más de un año (decisión del
 * autor) e intentos fallidos ya olvidados.
 *
 * Guardan datos personales —IP y user agent— y conservarlos más tiempo del que sirven para algo
 * solo agranda lo que se pierde en una filtración.
 */
@Injectable()
export class PurgeSecurityLogs {
  constructor(
    @Inject(AUDIT_LOG_CLEANER) private readonly auditLog: AuditLogCleaner,
    @Inject(LOGIN_THROTTLE_REPOSITORY) private readonly attempts: LoginThrottleRepository,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(): Promise<PurgedSecurityLogs> {
    // Un intento cuyo último fallo ya se olvidó (24 h) no cuenta para nada: su fila sobra.
    const forgotten = new Date(
      this.clock.now().getTime() - FAILURE_MEMORY_HOURS * MILLISECONDS_PER_HOUR,
    );

    return {
      auditEntries: await this.auditLog.deleteOlderThan(auditLogCutoff(this.clock)),
      loginAttempts: await this.attempts.deleteOlderThan(forgotten),
    };
  }
}
