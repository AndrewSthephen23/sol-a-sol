import { Injectable, Logger } from '@nestjs/common';
import argon2 from 'argon2';

import type { PasswordHasher } from '../ports/password-hasher.js';

/**
 * Parámetros de argon2id, según la hoja de recomendaciones de OWASP para el almacenamiento
 * de contraseñas: 19 MiB de memoria, 2 iteraciones y sin paralelismo.
 *
 * El coste de memoria es lo que encarece atacar el hash con GPU. La combinación elegida es la
 * primera que propone OWASP; las otras que admite (47 MiB con t=1, 12 MiB con t=3…) ofrecen la
 * misma resistencia y solo cambian el reparto entre memoria y tiempo.
 *
 * Los parámetros viajan **dentro** del hash (formato PHC), así que subirlos más adelante no
 * invalida los hashes ya guardados: los antiguos se siguen verificando con los suyos.
 */
export const ARGON2_OPTIONS = {
  type: argon2.argon2id,
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
} as const;

@Injectable()
export class Argon2PasswordHasher implements PasswordHasher {
  private readonly logger = new Logger(Argon2PasswordHasher.name);

  async hash(plain: string): Promise<string> {
    // argon2 genera una sal aleatoria por hash: dos hashes del mismo texto nunca coinciden.
    return argon2.hash(plain, ARGON2_OPTIONS);
  }

  async verify(plain: string, hash: string): Promise<boolean> {
    try {
      return await argon2.verify(hash, plain);
    } catch (error) {
      // Una contraseña equivocada devuelve `false` sin lanzar; llegar aquí significa que el hash
      // guardado no tiene forma de hash. Se falla cerrado, pero se avisa: si no, esa cuenta no
      // podría entrar nunca y no habría rastro del motivo. Nunca se registra ni la contraseña
      // ni el hash.
      this.logger.warn(`El hash almacenado no se pudo leer: ${describe(error)}`);

      return false;
    }
  }
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : 'motivo desconocido';
}
