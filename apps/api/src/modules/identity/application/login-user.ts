import { Inject, Injectable } from '@nestjs/common';
import { isCounterFresh } from '@sol-a-sol/domain';

import {
  InvalidCredentialsError,
  InvalidTotpCodeError,
  TotpRequiredError,
} from '../domain/errors.js';
import { DecoyPasswordHash } from '../infrastructure/decoy-password-hash.js';
import { SecretBox } from '../infrastructure/secret-box.js';
import { PASSWORD_HASHER, type PasswordHasher } from '../ports/password-hasher.js';
import { TOTP, type Totp } from '../ports/totp.js';
import {
  USER_REPOSITORY,
  type UserCredentials,
  type UserRepository,
} from '../ports/user-repository.js';

export interface LoginUserInput {
  /** Ya normalizado por el esquema de `@sol-a-sol/contracts`: recortado y en minúsculas. */
  email: string;
  password: string;
  totpCode?: string;
}

@Injectable()
export class LoginUser {
  constructor(
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    @Inject(PASSWORD_HASHER) private readonly passwords: PasswordHasher,
    private readonly decoy: DecoyPasswordHash,
    @Inject(TOTP) private readonly totp: Totp,
    private readonly secrets: SecretBox,
  ) {}

  /** Devuelve a quién pertenece la cuenta; abrir la sesión es cosa de `IssueSession`. */
  async execute({ email, password, totpCode }: LoginUserInput): Promise<string> {
    const credentials = await this.users.findCredentialsByEmail(email);

    // Se verifica **siempre**, exista la cuenta o no: contra el hash real si la hay y contra el
    // señuelo si no. Así los dos caminos cuestan lo mismo y el tiempo de respuesta no dice si
    // el correo está registrado. Por eso tampoco se puede salir antes con un `return`.
    const matches = await this.passwords.verify(
      password,
      credentials?.passwordHash ?? this.decoy.get(),
    );

    if (credentials === null || !matches) throw new InvalidCredentialsError();

    if (credentials.totpConfirmedAt !== null) await this.checkSecondFactor(credentials, totpCode);

    return credentials.id;
  }

  private async checkSecondFactor(
    credentials: UserCredentials,
    code: string | undefined,
  ): Promise<void> {
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
