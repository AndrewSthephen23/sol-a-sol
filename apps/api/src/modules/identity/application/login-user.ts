import { Inject, Injectable } from '@nestjs/common';

import { InvalidCredentialsError } from '../domain/errors.js';
import { DecoyPasswordHash } from '../infrastructure/decoy-password-hash.js';
import {
  ACCESS_TOKEN_ISSUER,
  type AccessToken,
  type AccessTokenIssuer,
} from '../ports/access-token-issuer.js';
import { PASSWORD_HASHER, type PasswordHasher } from '../ports/password-hasher.js';
import { USER_REPOSITORY, type UserRepository } from '../ports/user-repository.js';

export interface LoginUserInput {
  /** Ya normalizado por el esquema de `@sol-a-sol/contracts`: recortado y en minúsculas. */
  email: string;
  password: string;
}

@Injectable()
export class LoginUser {
  constructor(
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    @Inject(PASSWORD_HASHER) private readonly passwords: PasswordHasher,
    @Inject(ACCESS_TOKEN_ISSUER) private readonly tokens: AccessTokenIssuer,
    private readonly decoy: DecoyPasswordHash,
  ) {}

  async execute({ email, password }: LoginUserInput): Promise<AccessToken> {
    const credentials = await this.users.findCredentialsByEmail(email);

    // Se verifica **siempre**, exista la cuenta o no: contra el hash real si la hay y contra el
    // señuelo si no. Así los dos caminos cuestan lo mismo y el tiempo de respuesta no dice si
    // el correo está registrado. Por eso tampoco se puede salir antes con un `return`.
    const matches = await this.passwords.verify(
      password,
      credentials?.passwordHash ?? this.decoy.get(),
    );

    if (credentials === null || !matches) throw new InvalidCredentialsError();

    return this.tokens.issue(credentials.id);
  }
}
