import { Inject, Injectable } from '@nestjs/common';
import { type Clock, isCounterFresh } from '@sol-a-sol/domain';

import { CLOCK } from '../../../shared/time/system-clock.js';
import {
  InvalidTotpCodeError,
  TotpAlreadyEnabledError,
  TotpNotStartedError,
} from '../domain/errors.js';
import { SecretBox } from '../infrastructure/secret-box.js';
import { AUDIT_LOGGER, type AuditLogger } from '../ports/audit-logger.js';
import { TOTP, type Totp } from '../ports/totp.js';
import {
  RECOVERY_CODE_REPOSITORY,
  type RecoveryCodeRepository,
} from '../ports/recovery-code-repository.js';
import { USER_REPOSITORY, type UserRepository } from '../ports/user-repository.js';
import { IssueRecoveryCodes } from './recovery-codes.js';
import { ApplySecurityChange, type SecurityChangeNotice } from './security-change.js';

export interface TotpSetup {
  /** URI `otpauth://` para escanear. Se devuelve **una sola vez**. */
  uri: string;
  secret: string;
}

/** Empieza a activar el segundo factor. No queda activo hasta confirmarlo con un código. */
@Injectable()
export class SetupTotp {
  constructor(
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    @Inject(TOTP) private readonly totp: Totp,
    private readonly secrets: SecretBox,
  ) {}

  async execute(userId: string): Promise<TotpSetup> {
    const credentials = await this.users.findCredentialsById(userId);
    if (credentials === null) throw new TotpNotStartedError();
    // Reactivar sin desactivar antes dejaría al dueño creyendo que sigue con el código viejo.
    if (credentials.totpConfirmedAt !== null) throw new TotpAlreadyEnabledError();

    const { secret, uri } = this.totp.enrol(credentials.email);
    await this.users.startTotpEnrolment(userId, this.secrets.seal(secret));

    return { uri, secret };
  }
}

export interface ConfirmedTotp extends SecurityChangeNotice {
  /** Diez códigos en claro. Es la única vez que se pueden leer. */
  recoveryCodes: string[];
}

/**
 * Confirma el segundo factor con un código: recién aquí queda activo.
 *
 * Como al cambiar la contraseña (decisión 7), se cierran las demás sesiones: se abrieron sin
 * segundo factor. Los tokens personales siguen valiendo, y la respuesta los lista.
 */
@Injectable()
export class ConfirmTotp {
  constructor(
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    @Inject(TOTP) private readonly totp: Totp,
    @Inject(AUDIT_LOGGER) private readonly audit: AuditLogger,
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly secrets: SecretBox,
    private readonly issueRecoveryCodes: IssueRecoveryCodes,
    private readonly applySecurityChange: ApplySecurityChange,
  ) {}

  /** Devuelve los códigos de recuperación: se muestran **una sola vez**. */
  async execute(
    userId: string,
    code: string,
    currentRefreshToken?: string,
  ): Promise<ConfirmedTotp> {
    const credentials = await this.users.findCredentialsById(userId);
    if (credentials?.totpSecret == null) throw new TotpNotStartedError();
    if (credentials.totpConfirmedAt !== null) throw new TotpAlreadyEnabledError();

    const verification = this.totp.verify(this.secrets.open(credentials.totpSecret), code);
    if (verification === null) throw new InvalidTotpCodeError();

    // Se anota el periodo ya en la confirmación: ese mismo código no sirve además para entrar.
    await this.users.confirmTotp(userId, this.clock.now(), verification.counter);
    await this.audit.record({ userId, action: 'totp.enabled', entity: 'user', entityId: userId });

    // Se entregan con la activación: sin ellos, perder el teléfono dejaría al dueño fuera.
    const recoveryCodes = await this.issueRecoveryCodes.execute(userId);

    return {
      recoveryCodes,
      ...(await this.applySecurityChange.execute(userId, currentRefreshToken)),
    };
  }
}

/** Desactiva el segundo factor. Exige un código válido: es una rebaja de seguridad. */
@Injectable()
export class DisableTotp {
  constructor(
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    @Inject(TOTP) private readonly totp: Totp,
    @Inject(AUDIT_LOGGER) private readonly audit: AuditLogger,
    private readonly secrets: SecretBox,
    @Inject(RECOVERY_CODE_REPOSITORY) private readonly recoveryCodes: RecoveryCodeRepository,
  ) {}

  async execute(userId: string, code: string): Promise<void> {
    const credentials = await this.users.findCredentialsById(userId);
    if (credentials?.totpSecret == null || credentials.totpConfirmedAt === null) {
      throw new TotpNotStartedError();
    }

    const verification = this.totp.verify(this.secrets.open(credentials.totpSecret), code);
    if (verification === null) throw new InvalidTotpCodeError();

    const lastCounter =
      credentials.totpLastCounter === null ? null : Number(credentials.totpLastCounter);
    if (!isCounterFresh(verification.counter, lastCounter)) throw new InvalidTotpCodeError();

    await this.users.disableTotp(userId);
    // Sin segundo factor, unos códigos que lo sustituyen no tienen a qué sustituir.
    await this.recoveryCodes.deleteAllForUser(userId);
    await this.audit.record({ userId, action: 'totp.disabled', entity: 'user', entityId: userId });
  }
}
