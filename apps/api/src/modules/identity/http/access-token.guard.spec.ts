import { type ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import type { AccessTokens } from '../ports/access-tokens.js';
import { AccessTokenGuard } from './access-token.guard.js';

const USER_ID = 'user-1';

function contextWith(authorization: unknown): {
  context: ExecutionContext;
  request: { userId?: string };
} {
  const request = { headers: { authorization } };

  return {
    context: { switchToHttp: () => ({ getRequest: () => request }) } as unknown as ExecutionContext,
    request: request as { userId?: string },
  };
}

function guardWith(userId: string | null) {
  const verify = vi.fn(() => Promise.resolve(userId));
  const tokens: AccessTokens = {
    issue: () => Promise.resolve({ token: 't', expiresInSeconds: 900 }),
    verify,
  };

  return { guard: new AccessTokenGuard(tokens), verify };
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
});
