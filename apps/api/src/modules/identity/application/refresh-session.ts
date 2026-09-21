import { Inject, Injectable } from '@nestjs/common';
import { type Clock, hasExpired } from '@sol-a-sol/domain';

import { CLOCK } from '../../../shared/time/system-clock.js';
import { InvalidRefreshTokenError } from '../domain/errors.js';
import { hashSessionToken } from '../infrastructure/session-token.js';
import { AUDIT_LOGGER, type AuditLogger } from '../ports/audit-logger.js';
import {
  REFRESH_TOKEN_REPOSITORY,
  type RefreshTokenRepository,
  type StoredRefreshToken,
} from '../ports/refresh-token-repository.js';
import { IssueSession, type Session } from './issue-session.js';

export interface RefreshSessionInput {
  /** Valor de la cookie. Puede no venir: el resultado es el mismo error. */
  token: string | undefined;
  ip?: string;
  userAgent?: string;
}

/**
 * Canjea un refresco por una sesión nueva y **invalida el anterior** (rotación).
 *
 * Si llega uno ya canjeado, es que alguien lo copió: no hay forma de saber si quien lo presenta
 * es la víctima o el ladrón, así que se cierran **todas** las sesiones del usuario y se registra.
 */
@Injectable()
export class RefreshSession {
  constructor(
    @Inject(REFRESH_TOKEN_REPOSITORY) private readonly refreshTokens: RefreshTokenRepository,
    @Inject(AUDIT_LOGGER) private readonly audit: AuditLogger,
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly issueSession: IssueSession,
  ) {}

  async execute({ token, ip, userAgent }: RefreshSessionInput): Promise<Session> {
    if (token === undefined || token === '') throw new InvalidRefreshTokenError();

    const stored = await this.refreshTokens.findByHash(hashSessionToken(token));
    if (stored === null) throw new InvalidRefreshTokenError();

    if (stored.usedAt !== null) {
      await this.reportReuse(stored, ip, userAgent);
      throw new InvalidRefreshTokenError();
    }

    if (stored.revokedAt !== null || hasExpired(stored.expiresAt, this.clock)) {
      throw new InvalidRefreshTokenError();
    }

    // Si dos peticiones llegan a la vez con el mismo token, solo una lo marca; la otra pierde
    // la carrera y se trata como lo que parece desde fuera: un token usado dos veces.
    if (!(await this.refreshTokens.markUsed(stored.id, this.clock.now()))) {
      await this.reportReuse(stored, ip, userAgent);
      throw new InvalidRefreshTokenError();
    }

    return this.issueSession.execute(stored.userId);
  }

  private async reportReuse(
    stored: StoredRefreshToken,
    ip: string | undefined,
    userAgent: string | undefined,
  ): Promise<void> {
    await this.refreshTokens.revokeAllForUser(stored.userId, this.clock.now());
    await this.audit.record({
      userId: stored.userId,
      action: 'refresh_token.reused',
      entity: 'refresh_token',
      entityId: stored.id,
      ip,
      userAgent,
    });
  }
}
