import { Inject, Injectable } from '@nestjs/common';
import { afterFailedAttempt, type Clock, lockedSecondsLeft } from '@sol-a-sol/domain';

import { CLOCK } from '../../../shared/time/system-clock.js';
import { TooManyLoginAttemptsError } from '../domain/errors.js';
import { hashSessionToken } from '../infrastructure/session-token.js';
import { AUDIT_LOGGER, type AuditLogger } from '../ports/audit-logger.js';
import {
  LOGIN_THROTTLE_REPOSITORY,
  type LoginThrottleRepository,
} from '../ports/login-throttle-repository.js';
import type { RequestOrigin } from './personal-access-tokens.js';

export interface FailedAttempt extends RequestOrigin {
  /** Se sabe solo cuando el correo existe. Sin él, la bitácora guarda igual la IP. */
  userId?: string;
}

/**
 * Frena la fuerza bruta contra el inicio de sesión.
 *
 * Se cuentan **dos llaves por intento y por separado**: el correo y la IP. Si cualquiera de las
 * dos está bloqueada, no se acepta el intento. Solo por IP no protegería a quien tiene muchas
 * IPs enfrente; solo por cuenta permitiría dejar al dueño fuera a propósito, y por eso el
 * bloqueo tiene tope (15 minutos).
 *
 * El correo se guarda **hasheado**: la tabla no debe ser una lista de correos que alguien
 * probó, y aun así dos intentos contra el mismo correo tienen que caer en la misma fila.
 */
@Injectable()
export class LoginThrottle {
  constructor(
    @Inject(LOGIN_THROTTLE_REPOSITORY) private readonly attempts: LoginThrottleRepository,
    @Inject(AUDIT_LOGGER) private readonly audit: AuditLogger,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  /**
   * @throws {TooManyLoginAttemptsError} si el correo o la IP están bloqueados. Se comprueba
   * **antes** de mirar la contraseña: si no, quien está bloqueado seguiría probando.
   */
  async assertAllowed(email: string, ip: string | undefined): Promise<void> {
    const records = await Promise.all(keysFor(email, ip).map((key) => this.attempts.find(key)));
    const wait = Math.max(...records.map((record) => lockedSecondsLeft(record, this.clock)));

    if (wait > 0) throw new TooManyLoginAttemptsError(wait);
  }

  /** Anota el fallo en las dos llaves. Si alguna queda bloqueada, lo registra en la bitácora. */
  async recordFailure(email: string, { ip, userAgent, userId }: FailedAttempt): Promise<void> {
    let locked = false;

    for (const key of keysFor(email, ip)) {
      const record = afterFailedAttempt(await this.attempts.find(key), this.clock);
      await this.attempts.save(key, record);
      locked ||= record.lockedUntil !== null;
    }

    await this.audit.record({
      userId,
      action: locked ? 'login.locked' : 'login.failed',
      entity: 'user',
      entityId: userId,
      ip,
      userAgent,
    });
  }

  /** Un inicio de sesión correcto borra la cuenta de fallos de las dos llaves. */
  async forget(email: string, ip: string | undefined): Promise<void> {
    await this.attempts.clear(keysFor(email, ip));
  }
}

/**
 * Las llaves de un intento. Sin IP (una petición interna, o un cliente del que Express no la
 * sabe) queda solo la del correo: es mejor contar una que ninguna.
 */
function keysFor(email: string, ip: string | undefined): string[] {
  const keys = [`email:${hashSessionToken(email)}`];
  if (ip !== undefined && ip !== '') keys.push(`ip:${ip}`);

  return keys;
}
