import { Inject, Injectable } from '@nestjs/common';
import { assertPasswordIsStrong } from '@sol-a-sol/domain';

import { CurrentPasswordIncorrectError } from '../domain/errors.js';
import { AUDIT_LOGGER, type AuditLogger } from '../ports/audit-logger.js';
import { PASSWORD_HASHER, type PasswordHasher } from '../ports/password-hasher.js';
import { USER_REPOSITORY, type UserRepository } from '../ports/user-repository.js';
import type { RequestOrigin } from './personal-access-tokens.js';
import { ApplySecurityChange, type SecurityChangeNotice } from './security-change.js';

export interface ChangePasswordInput extends RequestOrigin {
  userId: string;
  currentPassword: string;
  newPassword: string;
  /** Cookie de refresco de la sesión desde la que se cambia: esa no se cierra. */
  currentRefreshToken: string | undefined;
}

/**
 * Cambia la contraseña. Pide la actual: una sesión abierta un momento en un equipo ajeno no
 * debe bastar para quedarse con la cuenta.
 */
@Injectable()
export class ChangePassword {
  constructor(
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    @Inject(PASSWORD_HASHER) private readonly passwords: PasswordHasher,
    @Inject(AUDIT_LOGGER) private readonly audit: AuditLogger,
    private readonly applySecurityChange: ApplySecurityChange,
  ) {}

  async execute({
    userId,
    currentPassword,
    newPassword,
    currentRefreshToken,
    ip,
    userAgent,
  }: ChangePasswordInput): Promise<SecurityChangeNotice> {
    const credentials = await this.users.findCredentialsById(userId);
    if (
      credentials === null ||
      !(await this.passwords.verify(currentPassword, credentials.passwordHash))
    ) {
      throw new CurrentPasswordIncorrectError();
    }

    // La misma política que al registrarse, y antes de hashear: no tiene sentido gastar
    // 19 MiB en una contraseña que se va a rechazar.
    assertPasswordIsStrong(newPassword);

    await this.users.updatePasswordHash(userId, await this.passwords.hash(newPassword));
    await this.audit.record({
      userId,
      action: 'password.changed',
      entity: 'user',
      entityId: userId,
      ip,
      userAgent,
    });

    return this.applySecurityChange.execute(userId, currentRefreshToken);
  }
}
