import { Module } from '@nestjs/common';

import { PrismaModule } from '../../shared/prisma/prisma.module.js';
import { RegisterUser } from './application/register-user.js';
import { AuthController } from './http/auth.controller.js';
import { RegistrationAllowedGuard } from './http/registration-allowed.guard.js';
import { Argon2PasswordHasher } from './infrastructure/argon2-password-hasher.js';
import { PrismaUserRepository } from './infrastructure/prisma-user-repository.js';
import { PASSWORD_HASHER } from './ports/password-hasher.js';
import { USER_REPOSITORY } from './ports/user-repository.js';

/**
 * Módulo identity. Entra a main detrás de FEATURE_IDENTITY: sus rutas llevan
 * `@RequiresFeature('identity')` y responden 404 mientras el flag esté apagado.
 */
@Module({
  // `PrismaModule` es global, pero se importa igualmente para que el módulo se sostenga solo:
  // así se puede montar en una prueba sin arrastrar el `AppModule` entero.
  imports: [PrismaModule],
  controllers: [AuthController],
  providers: [
    RegisterUser,
    RegistrationAllowedGuard,
    { provide: PASSWORD_HASHER, useClass: Argon2PasswordHasher },
    { provide: USER_REPOSITORY, useClass: PrismaUserRepository },
  ],
  exports: [PASSWORD_HASHER],
})
export class IdentityModule {}
