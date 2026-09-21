import { Module } from '@nestjs/common';

import { Argon2PasswordHasher } from './infrastructure/argon2-password-hasher.js';
import { PASSWORD_HASHER } from './ports/password-hasher.js';

/**
 * Módulo identity. Entra a main detrás de FEATURE_IDENTITY: sus rutas llevan
 * `@RequiresFeature('identity')` y responden 404 mientras el flag esté apagado.
 */
@Module({
  controllers: [],
  providers: [{ provide: PASSWORD_HASHER, useClass: Argon2PasswordHasher }],
  exports: [PASSWORD_HASHER],
})
export class IdentityModule {}
