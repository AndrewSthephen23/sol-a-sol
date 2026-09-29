import { describe, expect, it, vi } from 'vitest';

import { Session, type SessionChannel } from './session';

const ORIGIN = 'http://localhost:3000';
const REFRESH = '/api/v1/auth/refresh';
const LOGOUT = '/api/v1/auth/logout';
const TRANSACTIONS = `${ORIGIN}/api/v1/transactions`;

function json(status: number, body: unknown = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/** Una API falsa: `refresh` da el token indicado (o 401 si es `null`), el resto lo decide `api`. */
function fakeApi(
  api: (request: Request) => Response,
  refreshToken: () => string | null = () => 'renewed',
) {
  const calls: { path: string; authorization: string | null }[] = [];
  const fetch = vi.fn<typeof globalThis.fetch>((input, init) => {
    // La sesión llama a `refresh` y `logout` con rutas relativas, que en el navegador resuelve
    // la página; aquí se resuelven contra el origen de la web.
    const request =
      input instanceof Request ? input : new Request(new URL(String(input), ORIGIN), init);
    const path = new URL(request.url).pathname;
    calls.push({ path, authorization: request.headers.get('Authorization') });

    if (path === REFRESH) {
      const token = refreshToken();
      return Promise.resolve(token === null ? json(401) : json(200, { accessToken: token }));
    }
    if (path === LOGOUT) return Promise.resolve(new Response(null, { status: 204 }));

    return Promise.resolve(api(request));
  });

  return { fetch, calls, refreshes: () => calls.filter((call) => call.path === REFRESH).length };
}

/** 200 solo con el token renovado: el viejo ya caducó. */
function acceptsOnly(token: string) {
  return (request: Request) =>
    request.headers.get('Authorization') === `Bearer ${token}` ? json(200) : json(401);
}

describe('Session', () => {
  it('starts unknown, and restore() authenticates when the refresh cookie is still valid', async () => {
    const session = new Session({ fetch: fakeApi(() => json(200)).fetch });

    expect(session.status).toBe('unknown');
    await session.restore();

    expect(session.status).toBe('authenticated');
  });

  it('becomes anonymous when restore() finds no valid refresh cookie', async () => {
    const session = new Session({
      fetch: fakeApi(
        () => json(200),
        () => null,
      ).fetch,
    });

    await session.restore();

    expect(session.status).toBe('anonymous');
  });

  it('sends the access token it holds', async () => {
    const api = fakeApi(() => json(200));
    const session = new Session({ fetch: api.fetch });
    session.signIn('current');

    await session.fetch(TRANSACTIONS);

    expect(api.calls).toEqual([{ path: '/api/v1/transactions', authorization: 'Bearer current' }]);
  });

  it('on a 401, refreshes once and retries once with the new token', async () => {
    const api = fakeApi(acceptsOnly('renewed'));
    const session = new Session({ fetch: api.fetch });
    session.signIn('expired');

    const response = await session.fetch(TRANSACTIONS, { method: 'POST', body: '{"a":1}' });

    expect(response.status).toBe(200);
    expect(api.calls.map((call) => call.authorization)).toEqual([
      'Bearer expired',
      null,
      'Bearer renewed',
    ]);
    expect(session.status).toBe('authenticated');
  });

  it('retries with the original body, which a sent request has already consumed', async () => {
    const bodies: string[] = [];
    const api = fakeApi(() => json(401));
    const session = new Session({
      fetch: async (input, init) => {
        if (input instanceof Request && !input.url.endsWith(REFRESH)) {
          bodies.push(await input.clone().text());
        }
        return api.fetch(input, init);
      },
    });

    await session.fetch(TRANSACTIONS, { method: 'POST', body: '{"a":1}' });

    expect(bodies).toEqual(['{"a":1}', '{"a":1}']);
  });

  it('ends the session after two 401 in a row, without refreshing again', async () => {
    const api = fakeApi(() => json(401));
    const session = new Session({ fetch: api.fetch });
    session.signIn('expired');

    const response = await session.fetch(TRANSACTIONS);

    expect(response.status).toBe(401);
    expect(api.refreshes()).toBe(1);
    expect(session.status).toBe('anonymous');
  });

  it('ends the session when the refresh itself is rejected, without retrying', async () => {
    const api = fakeApi(
      () => json(401),
      () => null,
    );
    const session = new Session({ fetch: api.fetch });
    session.signIn('expired');

    await session.fetch(TRANSACTIONS);

    expect(api.calls.filter((call) => call.path === '/api/v1/transactions')).toHaveLength(1);
    expect(session.status).toBe('anonymous');
  });

  it('shares one refresh among requests that hit a 401 at the same time', async () => {
    const api = fakeApi(acceptsOnly('renewed'));
    const session = new Session({ fetch: api.fetch });
    session.signIn('expired');

    const responses = await Promise.all([
      session.fetch(TRANSACTIONS),
      session.fetch(TRANSACTIONS),
      session.fetch(TRANSACTIONS),
    ]);

    expect(responses.map((response) => response.status)).toEqual([200, 200, 200]);
    expect(api.refreshes()).toBe(1);
  });

  it('refreshes under a lock shared with the other tabs', async () => {
    const request = vi.fn((_name: string, task: () => Promise<unknown>) => task());
    const session = new Session({
      fetch: fakeApi(() => json(200)).fetch,
      locks: { request: request as never },
    });

    await session.refresh();

    expect(request).toHaveBeenCalledWith('sol-a-sol:refresh', expect.any(Function));
  });

  it('treats a network failure while refreshing as a finished session', async () => {
    const session = new Session({ fetch: () => Promise.reject(new TypeError('offline')) });

    expect(await session.refresh()).toBe(false);
    expect(session.status).toBe('anonymous');
  });

  it('leaves /auth responses alone: a failed login is not an expired session', async () => {
    const api = fakeApi(() => json(401));
    const session = new Session({ fetch: api.fetch });

    const response = await session.fetch(`${ORIGIN}/api/v1/auth/login`, { method: 'POST' });

    expect(response.status).toBe(401);
    expect(api.refreshes()).toBe(0);
    expect(session.status).toBe('unknown');
  });

  it('passes through any other status untouched', async () => {
    const api = fakeApi(() => json(404));
    const session = new Session({ fetch: api.fetch });

    expect((await session.fetch(TRANSACTIONS)).status).toBe(404);
    expect(api.refreshes()).toBe(0);
  });

  describe('logout', () => {
    function fakeChannel() {
      let listener: ((event: MessageEvent) => void) | undefined;
      const postMessage = vi.fn();
      const channel: SessionChannel & {
        receive: (data: unknown) => void;
        posted: typeof postMessage;
      } = {
        postMessage,
        posted: postMessage,
        addEventListener: (_type, callback) => {
          listener = callback;
        },
        receive: (data) => listener?.(new MessageEvent('message', { data })),
      };

      return channel;
    }

    it('calls the API, forgets the token and tells the other tabs', async () => {
      const api = fakeApi(() => json(200));
      const channel = fakeChannel();
      const session = new Session({ fetch: api.fetch, channel });
      session.signIn('current');

      await session.logout();
      await session.fetch(TRANSACTIONS);

      expect(api.calls[0]?.path).toBe(LOGOUT);
      expect(api.calls[1]?.authorization).toBeNull();
      expect(session.status).toBe('anonymous');
      expect(channel.posted).toHaveBeenCalledWith('logged-out');
    });

    it('never fails, even without network', async () => {
      const session = new Session({ fetch: () => Promise.reject(new TypeError('offline')) });
      session.signIn('current');

      await expect(session.logout()).resolves.toBeUndefined();
      expect(session.status).toBe('anonymous');
    });

    it('ends this tab too when another one logs out', () => {
      const channel = fakeChannel();
      const session = new Session({ fetch: fakeApi(() => json(200)).fetch, channel });
      session.signIn('current');

      channel.receive('logged-out');
      channel.receive('something else');

      expect(session.status).toBe('anonymous');
    });
  });

  it('notifies subscribers only when the status changes', () => {
    const session = new Session({ fetch: fakeApi(() => json(200)).fetch });
    const listener = vi.fn();
    const unsubscribe = session.subscribe(listener);

    session.signIn('a');
    session.signIn('b');
    expect(listener).toHaveBeenCalledTimes(1);
    expect(session.getStatus()).toBe('authenticated');

    unsubscribe();
    void session.logout();
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
