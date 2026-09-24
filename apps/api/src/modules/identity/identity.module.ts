import { Module } from '@nestjs/common';

import { EventsModule } from '../../shared/events/events.module.js';
import { PrismaModule } from '../../shared/prisma/prisma.module.js';
import { TimeModule } from '../../shared/time/time.module.js';
import { ChangePassword } from './application/change-password.js';
import { IssueSession } from './application/issue-session.js';
import { ListAccountIds } from './application/list-account-ids.js';
import { LoginThrottle } from './application/login-throttle.js';
import { LoginUser } from './application/login-user.js';
import { Logout } from './application/logout.js';
import {
  AuthenticatePersonalAccessToken,
  CreatePersonalAccessToken,
  ListPersonalAccessTokens,
  RevokePersonalAccessToken,
} from './application/personal-access-tokens.js';
import { ConfirmTotp, DisableTotp, SetupTotp } from './application/manage-totp.js';
import {
  IssueRecoveryCodes,
  RegenerateRecoveryCodes,
  UseRecoveryCode,
} from './application/recovery-codes.js';
import { RefreshSession } from './application/refresh-session.js';
import { PurgeSecurityLogs } from './application/purge-security-logs.js';
import { RegisterUser } from './application/register-user.js';
import { ApplySecurityChange } from './application/security-change.js';
import { AuthController } from './http/auth.controller.js';
import { AccessTokenGuard } from './http/access-token.guard.js';
import { PersonalAccessTokensController } from './http/personal-access-tokens.controller.js';
import { RegistrationAllowedGuard } from './http/registration-allowed.guard.js';
import { Argon2PasswordHasher } from './infrastructure/argon2-password-hasher.js';
import { DecoyPasswordHash } from './infrastructure/decoy-password-hash.js';
import { OtpAuthTotp } from './infrastructure/otpauth-totp.js';
import { PrismaAuditLogger } from './infrastructure/prisma-audit-logger.js';
import { PrismaLoginThrottleRepository } from './infrastructure/prisma-login-throttle-repository.js';
import { SecurityLogCleanup } from './infrastructure/security-log-cleanup.js';
import { PrismaPersonalAccessTokenRepository } from './infrastructure/prisma-personal-access-token-repository.js';
import { PrismaRecoveryCodeRepository } from './infrastructure/prisma-recovery-code-repository.js';
import { PrismaRefreshTokenRepository } from './infrastructure/prisma-refresh-token-repository.js';
import { JoseAccessTokens } from './infrastructure/jose-access-tokens.js';
import { PrismaUserRepository } from './infrastructure/prisma-user-repository.js';
import { RecoveryCodeGenerator } from './infrastructure/recovery-code-generator.js';
import { SecretBox } from './infrastructure/secret-box.js';
import { ACCESS_TOKENS } from './ports/access-tokens.js';
import { AUDIT_LOG_CLEANER } from './ports/audit-log-cleaner.js';
import { AUDIT_LOGGER } from './ports/audit-logger.js';
import { LOGIN_THROTTLE_REPOSITORY } from './ports/login-throttle-repository.js';
import { PERSONAL_ACCESS_TOKEN_REPOSITORY } from './ports/personal-access-token-repository.js';
import { RECOVERY_CODE_REPOSITORY } from './ports/recovery-code-repository.js';
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
  imports: [PrismaModule, TimeModule, EventsModule],
  controllers: [AuthController, PersonalAccessTokensController],
  providers: [
    RegisterUser,
    ListAccountIds,
    LoginUser,
    LoginThrottle,
    PurgeSecurityLogs,
    SecurityLogCleanup,
    IssueSession,
    RefreshSession,
    Logout,
    SetupTotp,
    ConfirmTotp,
    DisableTotp,
    IssueRecoveryCodes,
    RegenerateRecoveryCodes,
    UseRecoveryCode,
    CreatePersonalAccessToken,
    ListPersonalAccessTokens,
    RevokePersonalAccessToken,
    AuthenticatePersonalAccessToken,
    ApplySecurityChange,
    ChangePassword,
    RecoveryCodeGenerator,
    RegistrationAllowedGuard,
    AccessTokenGuard,
    SecretBox,
    DecoyPasswordHash,
    { provide: PASSWORD_HASHER, useClass: Argon2PasswordHasher },
    { provide: USER_REPOSITORY, useClass: PrismaUserRepository },
    { provide: ACCESS_TOKENS, useClass: JoseAccessTokens },
    { provide: REFRESH_TOKEN_REPOSITORY, useClass: PrismaRefreshTokenRepository },
    { provide: AUDIT_LOGGER, useClass: PrismaAuditLogger },
    { provide: LOGIN_THROTTLE_REPOSITORY, useClass: PrismaLoginThrottleRepository },
    // El mismo adaptador, con otro puerto: quien registra hechos no debe poder borrarlos.
    { provide: AUDIT_LOG_CLEANER, useExisting: AUDIT_LOGGER },
    { provide: TOTP, useClass: OtpAuthTotp },
    { provide: RECOVERY_CODE_REPOSITORY, useClass: PrismaRecoveryCodeRepository },
    {
      provide: PERSONAL_ACCESS_TOKEN_REPOSITORY,
      useClass: PrismaPersonalAccessTokenRepository,
    },
  ],
  // El guard y lo que necesita salen del módulo para que otros módulos protejan sus rutas con
  // él (el primero será `capture`, con `@AcceptsPersonalAccessToken('captures:write')`).
  exports: [
    PASSWORD_HASHER,
    AccessTokenGuard,
    ACCESS_TOKENS,
    AuthenticatePersonalAccessToken,
    // Para `pnpm db:seed`: recorrer las cuentas sin ver nada de sus credenciales.
    ListAccountIds,
  ],
})
export class IdentityModule {}
