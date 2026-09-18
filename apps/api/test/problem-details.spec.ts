import type { Server } from 'node:http';

import { Body, Controller, type INestApplication, Logger, Module, Post } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { type RegisterRequest, registerRequestSchema } from '@sol-a-sol/contracts';
import { InvalidCurrencyError, toCurrency } from '@sol-a-sol/domain';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { API_PREFIX, configureApp } from '../src/app.setup.js';
import { PROBLEM_CONTENT_TYPE, type ProblemDetails } from '../src/shared/http/problem-details.js';
import { ZodValidationPipe } from '../src/shared/http/zod-validation.pipe.js';

/**
 * Controlador de prueba: ejercita el pipe y el filtro juntos sobre HTTP real, sin tener que
 * esperar a que existan los endpoints de identidad (tarea 04 de H2).
 */
@Controller('echo')
class EchoController {
  @Post('register')
  register(@Body(new ZodValidationPipe(registerRequestSchema)) body: unknown): unknown {
    return body;
  }

  @Post('domain-error')
  domainError(): unknown {
    return toCurrency('EUR');
  }

  @Post('boom')
  boom(): never {
    throw new Error('connection to postgres://user:pass@db failed');
  }
}

@Module({ controllers: [EchoController] })
class EchoModule {}

describe('error responses (RFC 9457)', () => {
  let app: INestApplication;
  let server: Server;

  beforeAll(async () => {
    // El 500 se registra a propósito; se silencia para no ensuciar la salida de las pruebas.
    vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const moduleRef = await Test.createTestingModule({ imports: [EchoModule] }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    server = app.getHttpServer() as Server;
  });

  afterAll(async () => {
    vi.restoreAllMocks();
    await app.close();
  });

  it('answers an unknown route with problem+json instead of the NestJS default', async () => {
    const response = await request(server).get(`/${API_PREFIX}/no-existe`).expect(404);

    expect(response.headers['content-type']).toContain(PROBLEM_CONTENT_TYPE);
    expect(response.body).toMatchObject({
      type: 'urn:sol-a-sol:error:not-found',
      title: 'Not found',
      status: 404,
    });
    expect((response.body as ProblemDetails).detail).toEqual(expect.any(String));
  });

  it('answers an invalid body with 422 and one entry per field', async () => {
    const response = await request(server)
      .post(`/${API_PREFIX}/echo/register`)
      .send({ email: 'no-es-correo' })
      .expect(422);

    expect(response.headers['content-type']).toContain(PROBLEM_CONTENT_TYPE);
    expect(response.body).toMatchObject({
      type: 'urn:sol-a-sol:error:validation-failed',
      title: 'Validation failed',
      status: 422,
    });
    const { errors } = response.body as ProblemDetails;
    expect(errors?.map((entry) => entry.field)).toEqual(['email', 'password']);
    // El `code` es lo que la web traduce al español, así que ninguna entrada puede venir sin él.
    expect(errors?.every((entry) => entry.code !== '' && entry.message !== '')).toBe(true);
  });

  it('returns the body already normalised when it is valid', async () => {
    const response = await request(server)
      .post(`/${API_PREFIX}/echo/register`)
      .send({ email: '  Ana@Example.COM  ', password: 'una contraseña larga' })
      .expect(201);

    expect((response.body as RegisterRequest).email).toBe('ana@example.com');
  });

  it('answers a domain error with its stable code, for the web to translate', async () => {
    const response = await request(server).post(`/${API_PREFIX}/echo/domain-error`).expect(422);

    expect(response.headers['content-type']).toContain(PROBLEM_CONTENT_TYPE);
    expect(response.body).toMatchObject({
      type: 'urn:sol-a-sol:error:invalid-currency',
      status: 422,
      detail: new InvalidCurrencyError('EUR').message,
    });
  });

  it('answers an unexpected failure with a generic 500 that leaks nothing', async () => {
    const response = await request(server).post(`/${API_PREFIX}/echo/boom`).expect(500);

    expect(response.headers['content-type']).toContain(PROBLEM_CONTENT_TYPE);
    expect(response.body).toEqual({
      type: 'urn:sol-a-sol:error:internal-server-error',
      title: 'Internal server error',
      status: 500,
      detail: 'The request could not be processed.',
    });
    expect(JSON.stringify(response.body)).not.toContain('postgres');
  });
});
