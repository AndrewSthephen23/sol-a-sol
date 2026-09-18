import {
  type ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { DomainError } from '@sol-a-sol/domain';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import { ProblemDetailsFilter } from './problem-details.filter.js';
import { PROBLEM_CONTENT_TYPE, type ProblemDetails } from './problem-details.js';

class BrokenRuleError extends DomainError {
  readonly code = 'BROKEN_RULE';

  constructor() {
    super('The rule was broken.');
  }
}

interface Captured {
  status: number;
  headers: Record<string, string>;
  body: ProblemDetails;
}

function captureResponse() {
  const captured = { status: 0, headers: {}, body: {} } as Captured;
  const response = {
    status(code: number) {
      captured.status = code;
      return this;
    },
    setHeader(name: string, value: string) {
      captured.headers[name] = value;
    },
    json(body: unknown) {
      captured.body = body as ProblemDetails;
    },
  };
  const host = {
    switchToHttp: () => ({ getResponse: () => response }),
  } as unknown as ArgumentsHost;

  return { captured, host };
}

function handle(exception: unknown): Captured {
  const { captured, host } = captureResponse();
  new ProblemDetailsFilter().catch(exception, host);

  return captured;
}

describe('ProblemDetailsFilter', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('always answers with the problem+json content type', () => {
    const { headers } = handle(new NotFoundException());

    expect(headers['Content-Type']).toBe(PROBLEM_CONTENT_TYPE);
  });

  describe('validation errors', () => {
    const schema = z.object({ email: z.email(), age: z.number() });

    it('reports 422 with one entry per failing field', () => {
      const error = schema.safeParse({ email: 'no-es-correo', age: 'treinta' }).error;

      const { status, body } = handle(error);

      expect(status).toBe(HttpStatus.UNPROCESSABLE_ENTITY);
      expect(body).toMatchObject({
        type: 'urn:sol-a-sol:error:validation-failed',
        title: 'Validation failed',
        status: 422,
      });
      expect(body.errors?.map((entry) => entry.field)).toEqual(['email', 'age']);
      expect(body.errors?.every((entry) => entry.code === entry.code.toUpperCase())).toBe(true);
    });

    it('uses an empty field name when the failure is about the whole body', () => {
      const error = z.object({ email: z.email() }).safeParse('no es un objeto').error;

      const { body } = handle(error);

      expect(body.errors).toHaveLength(1);
      expect(body.errors?.[0]?.field).toBe('');
    });
  });

  describe('domain errors', () => {
    it('answers 422 with the domain code, so the web can translate it', () => {
      const { status, body } = handle(new BrokenRuleError());

      expect(status).toBe(HttpStatus.UNPROCESSABLE_ENTITY);
      expect(body).toEqual({
        type: 'urn:sol-a-sol:error:broken-rule',
        title: 'Unprocessable content',
        status: 422,
        detail: 'The rule was broken.',
      });
    });
  });

  describe('NestJS exceptions', () => {
    it('keeps the status and explains what happened', () => {
      const { status, body } = handle(new NotFoundException('Route not found'));

      expect(status).toBe(HttpStatus.NOT_FOUND);
      expect(body).toMatchObject({
        type: 'urn:sol-a-sol:error:not-found',
        status: 404,
        detail: 'Route not found',
      });
    });

    it('reads the detail from an object body', () => {
      const exception = new HttpException({ message: 'Ya existe' }, HttpStatus.CONFLICT);

      expect(handle(exception).body.detail).toBe('Ya existe');
    });

    it('reads the detail from a plain string body', () => {
      const exception = new HttpException('Sin cuerpo estructurado', HttpStatus.CONFLICT);

      expect(handle(exception).body.detail).toBe('Sin cuerpo estructurado');
    });

    it('falls back when the message is neither text nor a list', () => {
      const exception = new HttpException({ message: 42 }, HttpStatus.CONFLICT);

      expect(handle(exception).body.detail).toBe(exception.message);
    });

    it('joins a list of messages', () => {
      const exception = new HttpException({ message: ['uno', 'dos'] }, HttpStatus.BAD_REQUEST);

      expect(handle(exception).body.detail).toBe('uno dos');
    });

    it('falls back to the exception message when the body has none', () => {
      const exception = new HttpException({ statusCode: 409 }, HttpStatus.CONFLICT);

      expect(handle(exception).body.detail).toBe(exception.message);
    });
  });

  describe('unexpected errors', () => {
    it('answers a generic 500 without leaking anything internal', () => {
      vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
      const secret = new Error('connection to postgres://user:pass@db failed');

      const { status, body } = handle(secret);

      expect(status).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
      expect(body).toEqual({
        type: 'urn:sol-a-sol:error:internal-server-error',
        title: 'Internal server error',
        status: 500,
        detail: 'The request could not be processed.',
      });
      expect(JSON.stringify(body)).not.toContain('postgres');
    });

    it('logs the real error so it is not lost', () => {
      const log = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
      const cause = new Error('boom');

      handle(cause);

      expect(log).toHaveBeenCalledWith('Excepción no controlada', cause);
    });

    it('handles something thrown that is not an Error at all', () => {
      vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);

      expect(handle('una cadena suelta').status).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
    });
  });
});
