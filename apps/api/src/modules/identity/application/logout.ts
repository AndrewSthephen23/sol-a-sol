import { Inject, Injectable } from '@nestjs/common';
import type { Clock } from '@sol-a-sol/domain';

import { CLOCK } from '../../../shared/time/system-clock.js';
import { hashSessionToken } from '../infrastructure/session-token.js';
import {
  REFRESH_TOKEN_REPOSITORY,
  type RefreshTokenRepository,
} from '../ports/refresh-token-repository.js';

/**
 * Cierra la sesión actual.
 *
 * **Nunca falla.** Cerrar sesión con una cookie caducada, ajena o inexistente responde igual que
 * cerrarla bien: quien cierra sesión quiere irse, y devolverle un error no le aporta nada, pero
 * sí le diría a un tercero si un token que probó existe.
 */
@Injectable()
export class Logout {
  constructor(
    @Inject(REFRESH_TOKEN_REPOSITORY) private readonly refreshTokens: RefreshTokenRepository,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(token: string | undefined): Promise<void> {
    if (token === undefined || token === '') return;

    const stored = await this.refreshTokens.findByHash(hashSessionToken(token));
    if (stored === null) return;

    await this.refreshTokens.revoke(stored.id, this.clock.now());
  }
}
