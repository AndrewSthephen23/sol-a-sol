import { PassThrough } from 'node:stream';

import { pino } from 'pino';
import { describe, expect, it } from 'vitest';

import { CENSOR, moduleOf, pinoHttpOptions } from './logging.module.js';

const TOKEN = 'no-es-un-token-de-verdad';

/** Registra una línea con la configuración real y devuelve el JSON que sale. */
function logged(entry: Record<string, unknown>): string {
  const output = new PassThrough();
  let line = '';
  output.on('data', (chunk: Buffer) => (line += chunk.toString()));

  pino({ redact: pinoHttpOptions().redact }, output).info(entry, 'una petición');
  output.end();

  return line;
}

describe('what never reaches a log', () => {
  it('masks the Authorization header, so a log cannot impersonate anyone', () => {
    const line = logged({ req: { headers: { authorization: `Bearer ${TOKEN}` } } });

    expect(line).toContain(CENSOR);
    expect(line).not.toContain(TOKEN);
  });

  it('masks the cookies, where the refresh token travels', () => {
    const line = logged({ req: { headers: { cookie: `sas_refresh=${TOKEN}` } } });

    expect(line).not.toContain(TOKEN);
  });

  it('masks the cookie the answer sets', () => {
    const line = logged({ res: { headers: { 'set-cookie': `sas_refresh=${TOKEN}; HttpOnly` } } });

    expect(line).not.toContain(TOKEN);
  });

  it('leaves the rest of the request alone', () => {
    const line = logged({ req: { headers: { 'user-agent': 'Atajos de iOS' } } });

    expect(line).toContain('Atajos de iOS');
  });
});

describe('what every line says', () => {
  const options = pinoHttpOptions();

  it('follows the request id the caller brought, to trace it across services', () => {
    expect(options.genReqId({ headers: { 'x-request-id': 'pedido-1' } } as never)).toBe('pedido-1');
  });

  it('makes up an id when the caller brings none', () => {
    const first = options.genReqId({ headers: {} } as never);

    expect(first).not.toBe(options.genReqId({ headers: {} } as never));
    expect(first).toHaveLength(36);
  });

  it('says who it was and which module answered, never the email', () => {
    const request = { url: '/api/v1/tokens', userId: 'user-1', headers: {} };

    expect(options.customProps(request as never)).toEqual({ userId: 'user-1', module: 'tokens' });
  });

  it('leaves the user out while nobody is authenticated', () => {
    expect(options.customProps({ url: '/api/v1/auth/login', headers: {} } as never)).toEqual({
      userId: undefined,
      module: 'auth',
    });
  });

  it('keeps the health checks out of the log, or Docker would fill it', () => {
    expect(options.autoLogging.ignore({ url: '/health' } as never)).toBe(true);
    expect(options.autoLogging.ignore({ url: '/api/v1/tokens' } as never)).toBe(false);
  });

  it('writes the method, the route and the status', () => {
    const message = options.customSuccessMessage(
      { method: 'POST', url: '/api/v1/auth/login' } as never,
      { statusCode: 200 } as never,
    );

    expect(message).toBe('POST /api/v1/auth/login 200');
  });
});

describe('moduleOf', () => {
  it.each([
    ['/api/v1/auth/login', 'auth'],
    ['/api/v1/tokens', 'tokens'],
    ['/api/v1/tokens/01999999-9999-7999-8999-999999999999', 'tokens'],
    ['/api/v1/auth/login?redirect=/inicio', 'auth'],
    ['/health', 'health'],
    ['/health/ready', 'health'],
    ['/api/v1/openapi.json', 'openapi.json'],
  ])('reads %s as the module %j', (url, module) => {
    expect(moduleOf(url)).toBe(module);
  });

  it.each([undefined, '', '/'])('says nothing for %j', (url) => {
    expect(moduleOf(url)).toBe('');
  });
});
