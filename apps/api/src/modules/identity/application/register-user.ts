import { Inject, Injectable } from '@nestjs/common';
import { assertPasswordIsStrong } from '@sol-a-sol/domain';

import { EVENT_PUBLISHER, type EventPublisher } from '../../../shared/events/event-publisher.js';
import { USER_REGISTERED, type UserRegistered } from '../domain/events.js';
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
    @Inject(EVENT_PUBLISHER) private readonly events: EventPublisher,
  ) {}

  async execute({ email, password }: RegisterUserInput): Promise<UserAccount> {
    // La política antes de hashear: no tiene sentido gastar 19 MiB en una contraseña que se
    // va a rechazar, y así un intento masivo de registro sale más barato de rechazar.
    assertPasswordIsStrong(password);

    const account = await this.users.create({
      email,
      passwordHash: await this.passwords.hash(password),
    });
    // Después de crearla, no antes: quien escucha (las categorías iniciales) necesita la cuenta.
    const event: UserRegistered = { userId: account.id };
    await this.events.publish(USER_REGISTERED, event);

    return account;
  }
}
