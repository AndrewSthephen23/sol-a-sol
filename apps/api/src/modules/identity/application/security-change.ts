import { Inject, Injectable } from '@nestjs/common';
import type { Clock } from '@sol-a-sol/domain';

import { CLOCK } from '../../../shared/time/system-clock.js';
import { hashSessionToken } from '../infrastructure/session-token.js';
import {
  PERSONAL_ACCESS_TOKEN_REPOSITORY,
  type PersonalAccessTokenRepository,
  type PersonalAccessTokenSummary,
} from '../ports/personal-access-token-repository.js';
import {
  REFRESH_TOKEN_REPOSITORY,
  type RefreshTokenRepository,
} from '../ports/refresh-token-repository.js';

/** Lo que se le cuenta al dueño después de cambiar la contraseña o activar el segundo factor. */
export interface SecurityChangeNotice {
  /** Cuántas sesiones de otros navegadores se cerraron. */
  otherSessionsClosed: number;
  /**
   * Los tokens personales que **siguen valiendo**. No se revocan (decisión 7): hacerlo rompería
   * en silencio la captura desde el celular. Se devuelven para que la web avise y ofrezca
   * revocarlos.
   */
  personalAccessTokens: PersonalAccessTokenSummary[];
}

/**
 * Lo que sigue a un cambio de seguridad (decisión 7): se cierran **las demás** sesiones y se
 * avisa de los tokens personales, que no se tocan.
 *
 * Se conserva la sesión desde la que se hizo el cambio, reconocida por su cookie de refresco:
 * quien acaba de cambiar la contraseña no tiene por qué volver a entrar. Sin cookie (un cliente
 * que no es el navegador), se cierran todas.
 *
 * Los tokens de acceso ya emitidos a otros navegadores siguen valiendo hasta que caducan, como
 * mucho 15 minutos: son JWT sin estado y no hay lista de revocados que consultar.
 */
@Injectable()
export class ApplySecurityChange {
  constructor(
    @Inject(REFRESH_TOKEN_REPOSITORY) private readonly refreshTokens: RefreshTokenRepository,
    @Inject(PERSONAL_ACCESS_TOKEN_REPOSITORY)
    private readonly personalAccessTokens: PersonalAccessTokenRepository,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(
    userId: string,
    currentRefreshToken: string | undefined,
  ): Promise<SecurityChangeNotice> {
    const keep =
      currentRefreshToken === undefined || currentRefreshToken === ''
        ? undefined
        : hashSessionToken(currentRefreshToken);

    const otherSessionsClosed = await this.refreshTokens.revokeAllForUser(
      userId,
      this.clock.now(),
      keep,
    );

    return {
      otherSessionsClosed,
      personalAccessTokens: await this.personalAccessTokens.listActive(userId),
    };
  }
}
