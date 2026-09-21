import { Module } from '@nestjs/common';

import { PrismaModule } from '../../shared/prisma/prisma.module.js';
import { TimeModule } from '../../shared/time/time.module.js';
import { IssueSession } from './application/issue-session.js';
import { LoginUser } from './application/login-user.js';
import { Logout } from './application/logout.js';
import { ConfirmTotp, DisableTotp, SetupTotp } from './application/manage-totp.js';
import { RefreshSession } from './application/refresh-session.js';
import { RegisterUser } from './application/register-user.js';
import { AuthController } from './http/auth.controller.js';
import { AccessTokenGuard } from './http/access-token.guard.js';
import { RegistrationAllowedGuard } from './http/registration-allowed.guard.js';
import { Argon2PasswordHasher } from './infrastructure/argon2-password-hasher.js';
import { DecoyPasswordHash } from './infrastructure/decoy-password-hash.js';
import { OtpAuthTotp } from './infrastructure/otpauth-totp.js';
import { PrismaAuditLogger } from './infrastructure/prisma-audit-logger.js';
import { PrismaRefreshTokenRepository } from './infrastructure/prisma-refresh-token-repository.js';
import { JoseAccessTokens } from './infrastructure/jose-access-tokens.js';
import { PrismaUserRepository } from './infrastructure/prisma-user-repository.js';
import { SecretBox } from './infrastructure/secret-box.js';
import { ACCESS_TOKENS } from './ports/access-tokens.js';
import { AUDIT_LOGGER } from './ports/audit-logger.js';
import { TOTP } from './ports/totp.js';
import { REFRESH_TOKEN_REPOSITORY } from './ports/refresh-token-repository.js';
import { PASSWORD_HASHER } from './ports/password-hasher.js';
import { USER_REPOSITORY } from './ports/user-repository.js';

/**
 * Módulo identity. Entra a main detrás de FEATURE_IDENTITY: sus rutas llevan
 * `@RequiresFeature('identity')` y responden 404 mientras el flag esté apagado.
 */
@Module({
  // `PrismaModule` es global, pero se importa igualmente para que el módulo se sostenga solo:
  // así se puede montar en una prueba sin arrastrar el `AppModule` entero.
  imports: [PrismaModule, TimeModule],
  controllers: [AuthController],
  providers: [
    RegisterUser,
    LoginUser,
    IssueSession,
    RefreshSession,
    Logout,
    SetupTotp,
    ConfirmTotp,
    DisableTotp,
    RegistrationAllowedGuard,
    AccessTokenGuard,
    SecretBox,
    DecoyPasswordHash,
    { provide: PASSWORD_HASHER, useClass: Argon2PasswordHasher },
    { provide: USER_REPOSITORY, useClass: PrismaUserRepository },
    { provide: ACCESS_TOKENS, useClass: JoseAccessTokens },
    { provide: REFRESH_TOKEN_REPOSITORY, useClass: PrismaRefreshTokenRepository },
    { provide: AUDIT_LOGGER, useClass: PrismaAuditLogger },
    { provide: TOTP, useClass: OtpAuthTotp },
  ],
  exports: [PASSWORD_HASHER],
})
export class IdentityModule {}
