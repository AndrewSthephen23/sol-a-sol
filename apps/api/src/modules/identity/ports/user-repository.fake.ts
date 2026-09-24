import type { NewUser, UserAccount, UserCredentials, UserRepository } from './user-repository.js';

/**
 * Repositorio en memoria para las pruebas unitarias.
 *
 * Existe para que agregar un método al puerto no obligue a tocar cada doble a mano, que es lo
 * que venía pasando. No entra en el build (`*.fake.ts` está excluido).
 */
export class FakeUserRepository implements UserRepository {
  readonly created: NewUser[] = [];
  readonly totpEnrolments: { userId: string; secret: string }[] = [];
  readonly confirmations: { userId: string; confirmedAt: Date; counter: number }[] = [];
  readonly recordedCounters: { userId: string; counter: number }[] = [];
  readonly disabled: string[] = [];
  readonly passwordChanges: { userId: string; passwordHash: string }[] = [];

  constructor(
    private options: {
      anyUser?: boolean;
      credentials?: UserCredentials | null;
      ids?: string[];
    } = {},
  ) {}

  set credentials(credentials: UserCredentials | null) {
    this.options = { ...this.options, credentials };
  }

  hasAnyUser(): Promise<boolean> {
    return Promise.resolve(this.options.anyUser ?? false);
  }

  listIds(): Promise<string[]> {
    return Promise.resolve(this.options.ids ?? []);
  }

  findCredentialsByEmail(): Promise<UserCredentials | null> {
    return Promise.resolve(this.options.credentials ?? null);
  }

  findCredentialsById(): Promise<UserCredentials | null> {
    return Promise.resolve(this.options.credentials ?? null);
  }

  create(user: NewUser): Promise<UserAccount> {
    this.created.push(user);

    return Promise.resolve({
      id: '01999999-9999-7999-8999-999999999999',
      email: user.email,
      createdAt: new Date('2026-09-20T00:00:00.000Z'),
    });
  }

  startTotpEnrolment(userId: string, encryptedSecret: string): Promise<void> {
    this.totpEnrolments.push({ userId, secret: encryptedSecret });

    return Promise.resolve();
  }

  confirmTotp(userId: string, confirmedAt: Date, counter: number): Promise<void> {
    this.confirmations.push({ userId, confirmedAt, counter });

    return Promise.resolve();
  }

  recordTotpCounter(userId: string, counter: number): Promise<void> {
    this.recordedCounters.push({ userId, counter });

    return Promise.resolve();
  }

  disableTotp(userId: string): Promise<void> {
    this.disabled.push(userId);

    return Promise.resolve();
  }

  updatePasswordHash(userId: string, passwordHash: string): Promise<void> {
    this.passwordChanges.push({ userId, passwordHash });

    return Promise.resolve();
  }
}

/** Credenciales de una cuenta sin segundo factor, para partir de algo válido. */
export function fakeCredentials(overrides: Partial<UserCredentials> = {}): UserCredentials {
  return {
    id: 'user-1',
    email: 'ana@example.com',
    passwordHash: 'hash-real',
    totpSecret: null,
    totpConfirmedAt: null,
    totpLastCounter: null,
    ...overrides,
  };
}
