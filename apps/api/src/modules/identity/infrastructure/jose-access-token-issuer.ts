import { Inject, Injectable } from '@nestjs/common';
import { type Clock, accessTokenExpiry } from '@sol-a-sol/domain';
import { SignJWT } from 'jose';

import { CLOCK } from '../../../shared/time/system-clock.js';
import type { AccessToken, AccessTokenIssuer } from '../ports/access-token-issuer.js';

/** HMAC con SHA-256: una sola API firma y verifica, así que no hace falta un par de claves. */
const ALGORITHM = 'HS256';

/**
 * Mínimo de la clave, en bytes. HS256 usa una clave de 256 bits: una más corta reduce el
 * esfuerzo de falsificar un token hasta donde se puede probar por fuerza bruta.
 */
const MIN_SECRET_BYTES = 32;

@Injectable()
export class JoseAccessTokenIssuer implements AccessTokenIssuer {
  constructor(@Inject(CLOCK) private readonly clock: Clock) {}

  async issue(userId: string): Promise<AccessToken> {
    const { issuedAtInSeconds, expiresAtInSeconds } = accessTokenExpiry(this.clock);

    // El cuerpo lleva solo `sub`: quién es. Nada de correo ni de nada personal, porque un JWT
    // va firmado pero **no cifrado** y cualquiera que lo intercepte puede leerlo.
    const token = await new SignJWT({})
      .setProtectedHeader({ alg: ALGORITHM, typ: 'JWT' })
      .setSubject(userId)
      .setIssuedAt(issuedAtInSeconds)
      .setExpirationTime(expiresAtInSeconds)
      .sign(signingKey());

    return { token, expiresInSeconds: expiresAtInSeconds - issuedAtInSeconds };
  }
}

/**
 * Se lee en cada emisión y no al construir el adaptador, para que el proceso no arranque con una
 * clave y firme con otra si alguien cambia el entorno en caliente.
 */
function signingKey(): Uint8Array {
  const secret = process.env.AUTH_JWT_SECRET;

  if (secret === undefined || secret === '') {
    throw new Error('AUTH_JWT_SECRET is not set');
  }

  const key = new TextEncoder().encode(secret);
  if (key.byteLength < MIN_SECRET_BYTES) {
    // El mensaje dice el mínimo, nunca la clave ni su longitud real.
    throw new Error(`AUTH_JWT_SECRET must be at least ${String(MIN_SECRET_BYTES)} bytes long`);
  }

  return key;
}
