import { Inject, Injectable } from '@nestjs/common';
import { type Clock, normalizeRecoveryCode } from '@sol-a-sol/domain';

import { CLOCK } from '../../../shared/time/system-clock.js';
import { InvalidTotpCodeError, TotpNotStartedError } from '../domain/errors.js';
import { RecoveryCodeGenerator } from '../infrastructure/recovery-code-generator.js';
import { SecretBox } from '../infrastructure/secret-box.js';
import { hashSessionToken } from '../infrastructure/session-token.js';
import { AUDIT_LOGGER, type AuditLogger } from '../ports/audit-logger.js';
import {
  RECOVERY_CODE_REPOSITORY,
  type RecoveryCodeRepository,
} from '../ports/recovery-code-repository.js';
import { TOTP, type Totp } from '../ports/totp.js';
import { USER_REPOSITORY, type UserRepository } from '../ports/user-repository.js';

/** Crea un juego de códigos y devuelve los valores en claro, que solo existen en esa respuesta. */
@Injectable()
export class IssueRecoveryCodes {
  constructor(
    @Inject(RECOVERY_CODE_REPOSITORY) private readonly codes: RecoveryCodeRepository,
    private readonly generator: RecoveryCodeGenerator,
  ) {}

  async execute(userId: string): Promise<string[]> {
    const generated = this.generator.generate();

    await this.codes.replaceAll(
      userId,
      generated.map((code) => code.hash),
    );

    return generated.map((code) => code.formatted);
  }
}

/**
 * Rehace los códigos. Exige un código TOTP válido, igual que desactivar el segundo factor:
 * quien tenga la sesión abierta un momento no puede llevarse diez llaves nuevas.
 */
@Injectable()
export class RegenerateRecoveryCodes {
  constructor(
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    @Inject(TOTP) private readonly totp: Totp,
    @Inject(AUDIT_LOGGER) private readonly audit: AuditLogger,
    private readonly secrets: SecretBox,
    private readonly issueRecoveryCodes: IssueRecoveryCodes,
  ) {}

  async execute(userId: string, totpCode: string): Promise<string[]> {
    const credentials = await this.users.findCredentialsById(userId);
    if (credentials?.totpSecret == null || credentials.totpConfirmedAt === null) {
      throw new TotpNotStartedError();
    }

    if (this.totp.verify(this.secrets.open(credentials.totpSecret), totpCode) === null) {
      throw new InvalidTotpCodeError();
    }

    const codes = await this.issueRecoveryCodes.execute(userId);
    await this.audit.record({
      userId,
      action: 'recovery_codes.regenerated',
      entity: 'user',
      entityId: userId,
    });

    return codes;
  }
}

/** Gasta un código de recuperación. Lo usa el login cuando no hay teléfono a mano. */
@Injectable()
export class UseRecoveryCode {
  constructor(
    @Inject(RECOVERY_CODE_REPOSITORY) private readonly codes: RecoveryCodeRepository,
    @Inject(AUDIT_LOGGER) private readonly audit: AuditLogger,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  /** `false` si el código no existe, no es de esa cuenta o ya se gastó. */
  async execute(userId: string, code: string): Promise<boolean> {
    const stored = await this.codes.findUnused(
      userId,
      hashSessionToken(normalizeRecoveryCode(code)),
    );
    if (stored === null) return false;

    // Si dos peticiones llegan a la vez con el mismo código, solo una lo gasta.
    if (!(await this.codes.markUsed(stored.id, this.clock.now()))) return false;

    await this.audit.record({
      userId,
      action: 'recovery_code.used',
      entity: 'recovery_code',
      entityId: stored.id,
    });

    return true;
  }
}
