import { type ExecutionContext, NotFoundException } from '@nestjs/common';
import { afterEach, describe, expect, it } from 'vitest';

import { FakeUserRepository } from '../ports/user-repository.fake.js';
import type { UserRepository } from '../ports/user-repository.js';
import { RegistrationAllowedGuard } from './registration-allowed.guard.js';

const INVITE = 'codigo-de-invitacion';

function contextWith(body: unknown): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ body }) }),
  } as unknown as ExecutionContext;
}

function repositoryWith(anyUser: boolean): UserRepository {
  return new FakeUserRepository({ anyUser });
}
async function guardAllows(options: {
  mode?: string;
  invite?: string;
  hasAnyUser?: boolean;
  body?: unknown;
}): Promise<boolean> {
  process.env.REGISTRATION_MODE = options.mode ?? '';
  if (options.invite === undefined) delete process.env.REGISTRATION_INVITE_CODE;
  else process.env.REGISTRATION_INVITE_CODE = options.invite;

  const guard = new RegistrationAllowedGuard(repositoryWith(options.hasAnyUser ?? false));

  try {
    return await guard.canActivate(contextWith(options.body ?? {}));
  } catch (error) {
    if (error instanceof NotFoundException) return false;
    throw error;
  }
}

describe('RegistrationAllowedGuard', () => {
  afterEach(() => {
    delete process.env.REGISTRATION_MODE;
    delete process.env.REGISTRATION_INVITE_CODE;
  });

  it('lets the first person in when the registration is closed', async () => {
    await expect(guardAllows({ mode: 'closed', hasAnyUser: false })).resolves.toBe(true);
  });

  it('turns everyone away once an account exists', async () => {
    await expect(guardAllows({ mode: 'closed', hasAnyUser: true })).resolves.toBe(false);
  });

  // No decir "cerrado" es parte del diseño: un 403 confirmaría que el registro está ahí.
  it('answers exactly like a route that does not exist', async () => {
    const guard = new RegistrationAllowedGuard(repositoryWith(true));
    process.env.REGISTRATION_MODE = 'closed';

    await expect(guard.canActivate(contextWith({}))).rejects.toThrow(NotFoundException);
  });

  it('closes the registration when the variable is not set', async () => {
    await expect(guardAllows({ hasAnyUser: true })).resolves.toBe(false);
  });

  it('lets anyone in when it is open', async () => {
    await expect(guardAllows({ mode: 'open', hasAnyUser: true })).resolves.toBe(true);
  });

  describe('invite mode', () => {
    it('accepts the configured code', async () => {
      await expect(
        guardAllows({ mode: 'invite', invite: INVITE, body: { inviteCode: INVITE } }),
      ).resolves.toBe(true);
    });

    it('rejects a wrong code', async () => {
      await expect(
        guardAllows({ mode: 'invite', invite: INVITE, body: { inviteCode: 'otro' } }),
      ).resolves.toBe(false);
    });

    it('rejects a request with no code at all', async () => {
      await expect(guardAllows({ mode: 'invite', invite: INVITE, body: {} })).resolves.toBe(false);
    });

    it('rejects a code that is not text', async () => {
      await expect(
        guardAllows({ mode: 'invite', invite: INVITE, body: { inviteCode: 42 } }),
      ).resolves.toBe(false);
    });

    it('survives a body that is not an object', async () => {
      await expect(
        guardAllows({ mode: 'invite', invite: INVITE, body: 'una cadena' }),
      ).resolves.toBe(false);
    });

    it('rejects everyone when no code is configured', async () => {
      await expect(
        guardAllows({ mode: 'invite', body: { inviteCode: 'lo que sea' } }),
      ).resolves.toBe(false);
    });
  });
});
