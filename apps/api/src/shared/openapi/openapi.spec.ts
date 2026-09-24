import { PROBLEM_CONTENT_TYPE } from '@sol-a-sol/contracts';
import { describe, expect, it } from 'vitest';

import { buildOpenApiDocument } from './openapi.js';

interface JsonSchema {
  properties?: Record<string, Record<string, unknown>>;
  required?: string[];
}

interface Operation {
  requestBody?: { content: Record<string, { schema: JsonSchema }> };
  responses: Record<string, { content?: Record<string, { schema: unknown }> }>;
}

interface Document {
  openapi: string;
  info: { title: string; version: string };
  paths: Record<string, Record<string, Operation>>;
  components: { schemas: Record<string, JsonSchema> };
}

const REGISTER = '/api/v1/auth/register';
const LOGIN = '/api/v1/auth/login';
const PAYMENT_METHODS = '/api/v1/payment-methods';

function documentWith(identityEnabled: boolean): Document {
  return buildOpenApiDocument({
    version: '1.2.3',
    isFeatureEnabled: (module) => module === 'identity' && identityEnabled,
  }) as unknown as Document;
}

function registerBody(): JsonSchema {
  const operation = documentWith(true).paths[REGISTER]?.post;

  return operation?.requestBody?.content['application/json']?.schema ?? {};
}

describe('buildOpenApiDocument', () => {
  it('declares OpenAPI 3.0 and the product version', () => {
    const document = documentWith(true);

    expect(document.openapi).toBe('3.0.3');
    expect(document.info).toMatchObject({ title: 'Sol a Sol', version: '1.2.3' });
  });

  it('always documents the health checks and itself', () => {
    expect(Object.keys(documentWith(false).paths).toSorted()).toEqual([
      '/api/v1/openapi.json',
      '/health',
      '/health/ready',
    ]);
  });

  describe('modules behind a feature flag', () => {
    it('documents identity when it is on', () => {
      const { paths } = documentWith(true);

      expect(paths).toHaveProperty([REGISTER, 'post']);
      expect(paths).toHaveProperty([LOGIN, 'post']);
    });

    // Documentarlas confirmaría justo lo que su 404 se esfuerza en ocultar.
    it('leaves them out when it is off', () => {
      const { paths } = documentWith(false);

      expect(paths).not.toHaveProperty(REGISTER);
      expect(paths).not.toHaveProperty(LOGIN);
    });

    it('says nothing about identity anywhere in the document', () => {
      expect(JSON.stringify(documentWith(false))).not.toMatch(/auth|identity/i);
    });

    it('documents the payment methods only while catalog is on', () => {
      const withCatalog = buildOpenApiDocument({
        version: '1.2.3',
        isFeatureEnabled: (module) => module === 'catalog',
      }) as unknown as Document;

      expect(withCatalog.paths).toHaveProperty([PAYMENT_METHODS, 'get']);
      expect(withCatalog.paths).toHaveProperty([PAYMENT_METHODS, 'post']);
      expect(withCatalog.paths).toHaveProperty([`${PAYMENT_METHODS}/{id}`, 'patch']);
      expect(withCatalog.paths).toHaveProperty(['/api/v1/categories', 'get']);
      expect(withCatalog.paths).toHaveProperty(['/api/v1/categories', 'post']);
      expect(withCatalog.paths).toHaveProperty(['/api/v1/categories/{id}', 'patch']);
      expect(JSON.stringify(documentWith(true))).not.toMatch(/payment|catalog|categor/i);
    });
  });

  describe('the schemas come from the same Zod objects the API validates with', () => {
    it('describes the register body with its real fields', () => {
      const body = registerBody();

      expect(Object.keys(body.properties ?? {}).toSorted()).toEqual([
        'email',
        'inviteCode',
        'password',
      ]);
      expect(body.required).toEqual(['email', 'password']);
    });

    it('carries the email format and the defensive password limit', () => {
      const { properties } = registerBody();

      expect(properties?.email?.format).toBe('email');
      expect(properties?.password?.maxLength).toBe(256);
    });
  });

  describe('errors', () => {
    it('defines Problem Details once, as a component', () => {
      const problem = documentWith(true).components.schemas.ProblemDetails;

      expect(Object.keys(problem?.properties ?? {}).toSorted()).toEqual([
        'detail',
        'errors',
        'status',
        'title',
        'type',
      ]);
    });

    it('points every failure at that component, with the right content type', () => {
      const login = documentWith(true).paths[LOGIN]?.post;

      for (const status of ['401', '404', '422']) {
        expect(login?.responses[status]?.content?.[PROBLEM_CONTENT_TYPE]?.schema).toEqual({
          $ref: '#/components/schemas/ProblemDetails',
        });
      }
    });
  });
});
