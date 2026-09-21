import { Inject, Injectable } from '@nestjs/common';
import { type Clock, refreshTokenExpiresAt } from '@sol-a-sol/domain';

import { CLOCK } from '../../../shared/time/system-clock.js';
import { createSessionToken } from '../infrastructure/session-token.js';
import {
  ACCESS_TOKEN_ISSUER,
  type AccessToken,
  type AccessTokenIssuer,
} from '../ports/access-token-issuer.js';
import {
  REFRESH_TOKEN_REPOSITORY,
  type RefreshTokenRepository,
} from '../ports/refresh-token-repository.js';

export interface Session {
  access: AccessToken;
  /** Valor en claro del refresco. Solo se devuelve aquí, para ponerlo en la cookie. */
  refreshToken: string;
  refreshExpiresAt: Date;
}

/** Abre una sesión: un token de acceso corto y un refresco guardado hasheado. */
@Injectable()
export class IssueSession {
  constructor(
    @Inject(ACCESS_TOKEN_ISSUER) private readonly tokens: AccessTokenIssuer,
    @Inject(REFRESH_TOKEN_REPOSITORY) private readonly refreshTokens: RefreshTokenRepository,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(userId: string): Promise<Session> {
    const refresh = createSessionToken();
    const refreshExpiresAt = refreshTokenExpiresAt(this.clock);

    await this.refreshTokens.create({
      userId,
      tokenHash: refresh.hash,
      expiresAt: refreshExpiresAt,
    });

    return {
      access: await this.tokens.issue(userId),
      refreshToken: refresh.value,
      refreshExpiresAt,
    };
  }
}
