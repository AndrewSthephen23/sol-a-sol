import { PasswordTooShortError } from '@sol-a-sol/domain';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { RecordingEventPublisher } from '../../../shared/events/event-publisher.fake.js';
import { USER_REGISTERED } from '../domain/events.js';
import type { PasswordHasher } from '../ports/password-hasher.js';
import { FakeUserRepository } from '../ports/user-repository.fake.js';
import { RegisterUser } from './register-user.js';

const STRONG = 'caballo grapa batería';

describe('RegisterUser', () => {
  let repository: FakeUserRepository;
  let hash: ReturnType<typeof vi.fn<(plain: string) => Promise<string>>>;
  let events: RecordingEventPublisher;
  let registerUser: RegisterUser;

  beforeEach(() => {
    repository = new FakeUserRepository();
    hash = vi.fn((plain: string) => Promise.resolve(`hashed:${plain}`));
    const hasher: PasswordHasher = { hash, verify: () => Promise.resolve(true) };
    events = new RecordingEventPublisher();
    registerUser = new RegisterUser(repository, hasher, events);
  });

  it('creates the account and returns only public data', async () => {
    const account = await registerUser.execute({ email: 'ana@example.com', password: STRONG });

    expect(account).toEqual({
      id: '01999999-9999-7999-8999-999999999999',
      email: 'ana@example.com',
      createdAt: new Date('2026-09-20T00:00:00.000Z'),
    });
  });

  it('stores the hash, never the password', async () => {
    await registerUser.execute({ email: 'ana@example.com', password: STRONG });

    expect(repository.created).toEqual([
      { email: 'ana@example.com', passwordHash: `hashed:${STRONG}` },
    ]);
  });

  // Así `catalog` le da sus categorías iniciales sin que `identity` sepa que existe.
  it('announces the new account once it exists', async () => {
    const account = await registerUser.execute({ email: 'ana@example.com', password: STRONG });

    expect(events.published).toEqual([{ name: USER_REGISTERED, payload: { userId: account.id } }]);
  });

  it('announces nothing when the account is not created', async () => {
    await expect(
      registerUser.execute({ email: 'ana@example.com', password: 'corta' }),
    ).rejects.toThrow();

    expect(events.published).toEqual([]);
  });

  it('applies the domain password policy', async () => {
    await expect(
      registerUser.execute({ email: 'ana@example.com', password: 'corta' }),
    ).rejects.toThrow(PasswordTooShortError);
  });

  // Hashear cuesta 19 MiB y 35 ms: gastarlos en una contraseña que se va a rechazar haría
  // barato tumbar la API mandando registros inválidos en masa.
  it('rejects a weak password before spending anything on hashing', async () => {
    await expect(
      registerUser.execute({ email: 'ana@example.com', password: 'corta' }),
    ).rejects.toThrow();

    expect(hash).not.toHaveBeenCalled();
    expect(repository.created).toEqual([]);
  });
});
