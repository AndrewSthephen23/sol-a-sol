import { Inject, Injectable } from '@nestjs/common';
import { isCounterFresh } from '@sol-a-sol/domain';

import {
  InvalidCredentialsError,
  InvalidTotpCodeError,
  TotpRequiredError,
} from '../domain/errors.js';
import { DecoyPasswordHash } from '../infrastructure/decoy-password-hash.js';
import { SecretBox } from '../infrastructure/secret-box.js';
import { AUDIT_LOGGER, type AuditLogger } from '../ports/audit-logger.js';
import { PASSWORD_HASHER, type PasswordHasher } from '../ports/password-hasher.js';
import { TOTP, type Totp } from '../ports/totp.js';
import { LoginThrottle } from './login-throttle.js';
import type { RequestOrigin } from './personal-access-tokens.js';
import { UseRecoveryCode } from './recovery-codes.js';
import {
  USER_REPOSITORY,
  type UserCredentials,
  type UserRepository,
} from '../ports/user-repository.js';

export interface LoginUserInput extends RequestOrigin {
  /** Ya normalizado por el esquema de `@sol-a-sol/contracts`: recortado y en minúsculas. */
  email: string;
  password: string;
  totpCode?: string;
  /** Alternativa al código del segundo factor cuando no se tiene el teléfono. */
  recoveryCode?: string;
}

@Injectable()
export class LoginUser {
  constructor(
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    @Inject(PASSWORD_HASHER) private readonly passwords: PasswordHasher,
    private readonly decoy: DecoyPasswordHash,
    @Inject(TOTP) private readonly totp: Totp,
    private readonly secrets: SecretBox,
    private readonly useRecoveryCode: UseRecoveryCode,
    private readonly throttle: LoginThrottle,
    @Inject(AUDIT_LOGGER) private readonly audit: AuditLogger,
  ) {}

  /** Devuelve a quién pertenece la cuenta; abrir la sesión es cosa de `IssueSession`. */
  async execute({
    email,
    password,
    totpCode,
    recoveryCode,
    ip,
    userAgent,
  }: LoginUserInput): Promise<string> {
    // Antes que nada: quien está bloqueado no debe poder seguir probando contraseñas.
    await this.throttle.assertAllowed(email, ip);

    const credentials = await this.users.findCredentialsByEmail(email);
    const origin = { ip, userAgent, userId: credentials?.id };

    // Se verifica **siempre**, exista la cuenta o no: contra el hash real si la hay y contra el
    // señuelo si no. Así los dos caminos cuestan lo mismo y el tiempo de respuesta no dice si
    // el correo está registrado. Por eso tampoco se puede salir antes con un `return`.
    const matches = await this.passwords.verify(
      password,
      credentials?.passwordHash ?? this.decoy.get(),
    );

    if (credentials === null || !matches) {
      await this.throttle.recordFailure(email, origin);
      throw new InvalidCredentialsError();
    }

    if (credentials.totpConfirmedAt !== null) {
      // Un código equivocado también cuenta como intento fallido: son solo un millón, y sin
      // freno quien ya tiene la contraseña podría probarlos todos. Llegar **sin** código no
      // cuenta: no es un intento de adivinar nada.
      try {
        await this.checkSecondFactor(credentials, totpCode, recoveryCode);
      } catch (error) {
        if (error instanceof TotpRequiredError) throw error;
        await this.throttle.recordFailure(email, origin);
        throw error;
      }
    }

    await this.throttle.forget(email, ip);
    await this.audit.record({
      userId: credentials.id,
      action: 'login.succeeded',
      entity: 'user',
      entityId: credentials.id,
      ip,
      userAgent,
    });

    return credentials.id;
  }

  private async checkSecondFactor(
    credentials: UserCredentials,
    code: string | undefined,
    recoveryCode: string | undefined,
  ): Promise<void> {
    // El código de recuperación es la salida cuando no hay teléfono: se acepta en su lugar,
    // nunca además, y cada uno sirve una sola vez.
    if (recoveryCode !== undefined && recoveryCode !== '') {
      if (!(await this.useRecoveryCode.execute(credentials.id, recoveryCode))) {
        throw new InvalidTotpCodeError();
      }

      return;
    }

    // Pedir el código confirma que la contraseña era correcta. Es inevitable —sin decirlo no
    // habría forma de pedirlo— y es justo la razón de ser del segundo factor: saber la
    // contraseña ya no basta.
    if (code === undefined || code === '' || credentials.totpSecret === null) {
      throw new TotpRequiredError();
    }

    const verification = this.totp.verify(this.secrets.open(credentials.totpSecret), code);
    if (verification === null) throw new InvalidTotpCodeError();

    const lastCounter =
      credentials.totpLastCounter === null ? null : Number(credentials.totpLastCounter);
    if (!isCounterFresh(verification.counter, lastCounter)) throw new InvalidTotpCodeError();

    await this.users.recordTotpCounter(credentials.id, verification.counter);
  }
}
