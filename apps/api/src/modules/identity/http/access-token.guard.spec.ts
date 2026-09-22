import { type ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { describe, expect, it, vi } from 'vitest';

import type { AuthenticatePersonalAccessToken } from '../application/personal-access-tokens.js';
import type { AccessTokens } from '../ports/access-tokens.js';
import { AcceptsPersonalAccessToken, AccessTokenGuard } from './access-token.guard.js';

const USER_ID = 'user-1';
const PERSONAL_TOKEN = 'sas_pat_cualquier-cosa';

/** Los manejadores de dos rutas: uno solo para sesiones y otro que acepta tokens personales. */
const HANDLERS = {
  sessionOnly: (): undefined => undefined,
  capture: (): undefined => undefined,
};
AcceptsPersonalAccessToken('captures:write')(HANDLERS.capture);

function contextWith(
  authorization: unknown,
  handler: keyof typeof HANDLERS = 'sessionOnly',
): {
  context: ExecutionContext;
  request: { userId?: string };
} {
  const request = {
    headers: { authorization, 'user-agent': 'Atajos de iOS' },
    ip: '203.0.113.7',
  };

  return {
    context: {
      switchToHttp: () => ({ getRequest: () => request }),
      getHandler: () => HANDLERS[handler],
      // Un controlador sin metadata propia: lo que cuenta es la del manejador.
      getClass: () => Object,
    } as unknown as ExecutionContext,
    request: request as { userId?: string },
  };
}

function guardWith(userId: string | null) {
  const verify = vi.fn(() => Promise.resolve(userId));
  const tokens: AccessTokens = {
    issue: () => Promise.resolve({ token: 't', expiresInSeconds: 900 }),
    verify,
  };
  const authenticate = vi.fn(() => Promise.resolve(USER_ID));
  const personalAccessTokens = {
    execute: authenticate,
  } as unknown as AuthenticatePersonalAccessToken;

  return {
    guard: new AccessTokenGuard(tokens, personalAccessTokens, new Reflector()),
    verify,
    authenticate,
  };
}

describe('AccessTokenGuard', () => {
  it('lets a valid bearer token through', async () => {
    const { guard } = guardWith(USER_ID);
    const { context } = contextWith('Bearer un-token');

    await expect(guard.canActivate(context)).resolves.toBe(true);
  });

  it('leaves the user id where the route can pick it up', async () => {
    const { guard } = guardWith(USER_ID);
    const { context, request } = contextWith('Bearer un-token');

    await guard.canActivate(context);

    expect(request.userId).toBe(USER_ID);
  });

  it('passes the token along without the scheme', async () => {
    const { guard, verify } = guardWith(USER_ID);

    await guard.canActivate(contextWith('Bearer un-token').context);

    expect(verify).toHaveBeenCalledWith('un-token');
  });

  describe('turning requests away', () => {
    it.each([
      ['no header at all', undefined],
      ['an empty header', ''],
      ['another scheme', 'Basic dXNlcjpwYXNz'],
      ['the scheme in lower case', 'bearer un-token'],
      ['a bearer with nothing after it', 'Bearer '],
      ['a header that is not text', 42],
    ])('rejects %s', async (_case, header) => {
      const { guard } = guardWith(USER_ID);

      await expect(guard.canActivate(contextWith(header).context)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('rejects a token the issuer does not recognise', async () => {
      const { guard } = guardWith(null);

      await expect(guard.canActivate(contextWith('Bearer un-token').context)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('does not check a token when there is none to check', async () => {
      const { guard, verify } = guardWith(USER_ID);

      await expect(guard.canActivate(contextWith(undefined).context)).rejects.toThrow();
      expect(verify).not.toHaveBeenCalled();
    });
  });

  describe('personal access tokens', () => {
    it('checks them as personal tokens, not as a session', async () => {
      const { guard, verify, authenticate } = guardWith(USER_ID);
      const { context, request } = contextWith(`Bearer ${PERSONAL_TOKEN}`, 'capture');

      await expect(guard.canActivate(context)).resolves.toBe(true);

      expect(verify).not.toHaveBeenCalled();
      expect(authenticate).toHaveBeenCalledWith({
        token: PERSONAL_TOKEN,
        requiredScope: 'captures:write',
        ip: '203.0.113.7',
        userAgent: 'Atajos de iOS',
      });
      expect(request.userId).toBe(USER_ID);
    });

    // Sin `@AcceptsPersonalAccessToken`, la ruta es solo para sesiones: el caso de uso lo
    // rechazará con un 403 y dejará constancia.
    it('asks for no scope on a route that is only for sessions', async () => {
      const { guard, authenticate } = guardWith(USER_ID);

      await guard.canActivate(contextWith(`Bearer ${PERSONAL_TOKEN}`).context);

      expect(authenticate).toHaveBeenCalledWith(expect.objectContaining({ requiredScope: null }));
    });

    it('lets the rejection of a personal token through untouched', async () => {
      const { guard, authenticate } = guardWith(USER_ID);
      const rejection = new Error('token personal rechazado');
      authenticate.mockRejectedValueOnce(rejection);

      await expect(
        guard.canActivate(contextWith(`Bearer ${PERSONAL_TOKEN}`, 'capture').context),
      ).rejects.toBe(rejection);
    });
  });
});
