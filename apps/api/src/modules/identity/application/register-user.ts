import { Inject, Injectable } from '@nestjs/common';
import { assertPasswordIsStrong } from '@sol-a-sol/domain';

import { PASSWORD_HASHER, type PasswordHasher } from '../ports/password-hasher.js';
import {
  USER_REPOSITORY,
  type UserAccount,
  type UserRepository,
} from '../ports/user-repository.js';

export interface RegisterUserInput {
  /** Ya normalizado por el esquema de `@sol-a-sol/contracts`: recortado y en minúsculas. */
  email: string;
  password: string;
}

/** Crea la cuenta. Quién puede llegar hasta aquí lo decide `RegistrationAllowedGuard`. */
@Injectable()
export class RegisterUser {
  constructor(
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    @Inject(PASSWORD_HASHER) private readonly passwords: PasswordHasher,
  ) {}

  async execute({ email, password }: RegisterUserInput): Promise<UserAccount> {
    // La política antes de hashear: no tiene sentido gastar 19 MiB en una contraseña que se
    // va a rechazar, y así un intento masivo de registro sale más barato de rechazar.
    assertPasswordIsStrong(password);

    return this.users.create({ email, passwordHash: await this.passwords.hash(password) });
  }
}
