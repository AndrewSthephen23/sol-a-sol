import type { Server } from 'node:http';

import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';

import { AppModule } from '../src/app.module.js';
import { API_PREFIX, configureApp } from '../src/app.setup.js';

const DOCUMENT = `/${API_PREFIX}/openapi.json`;

interface OpenApiDocument {
  openapi: string;
  info: { title: string; version: string };
  paths: Record<string, Record<string, unknown>>;
  components: { schemas: Record<string, unknown> };
}

/** Rutas que Express tiene realmente registradas, con su método. */
function registeredRoutes(app: INestApplication): { method: string; path: string }[] {
  const instance = app.getHttpAdapter().getInstance() as {
    router?: { stack?: { route?: { path?: string; methods?: Record<string, boolean> } }[] };
  };

  return (instance.router?.stack ?? []).flatMap((layer) => {
    const route = layer.route;
    if (!route?.path) return [];

    // Nest registra cada endpoint con **un** método; un middleware aplicado a todas las rutas
    // (el log de peticiones) queda registrado con todos a la vez. No es un endpoint, así que
    // no hay nada que documentar de él.
    const methods = Object.keys(route.methods ?? {});
    if (methods.length !== 1) return [];

    // Express escribe los parámetros como `:id` y OpenAPI como `{id}`.
    const path = route.path.replaceAll(/:(\w+)/g, '{$1}');

    return methods.map((method) => ({ method, path }));
  });
}

describe('GET /openapi.json', () => {
  let app: INestApplication;
  let server: Server;

  beforeAll(async () => {
    process.env.DATABASE_URL = inject('databaseUrl');
    process.env.FEATURE_IDENTITY = 'true';
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    server = app.getHttpServer() as Server;
  });

  afterAll(async () => {
    delete process.env.FEATURE_IDENTITY;
    await app.close();
  });

  it('serves an OpenAPI 3.0 document', async () => {
    const response = await request(server).get(DOCUMENT).expect(200);
    const document = response.body as OpenApiDocument;

    expect(response.headers['content-type']).toContain('application/json');
    expect(document.openapi).toBe('3.0.3');
    expect(document.info.title).toBe('Sol a Sol');
  });

  /**
   * La razón de ser de esta prueba: agregar un endpoint y olvidar documentarlo deja de ser
   * posible en silencio. Si el documento se generara a mano, esto se desincronizaría solo.
   */
  it('documents every route the API actually exposes', async () => {
    const response = await request(server).get(DOCUMENT).expect(200);
    const { paths } = response.body as OpenApiDocument;

    const undocumented = registeredRoutes(app).filter(
      ({ method, path }) => paths[path]?.[method] === undefined,
    );

    expect(undocumented).toEqual([]);
  });

  it('finds more than one route, so the check above cannot pass by being empty', () => {
    expect(registeredRoutes(app).length).toBeGreaterThan(1);
  });

  it('documents nothing that the API does not expose', async () => {
    const response = await request(server).get(DOCUMENT).expect(200);
    const { paths } = response.body as OpenApiDocument;
    const real = new Set(registeredRoutes(app).map(({ method, path }) => `${method} ${path}`));

    const invented = Object.entries(paths).flatMap(([path, methods]) =>
      Object.keys(methods)
        .map((method) => `${method} ${path}`)
        .filter((route) => !real.has(route)),
    );

    expect(invented).toEqual([]);
  });

  it('is not cached, so it never goes stale after a deploy', async () => {
    const response = await request(server).get(DOCUMENT).expect(200);

    expect(response.headers['cache-control']).toBe('no-store');
  });

  describe('when a module is switched off', () => {
    it('leaves its routes out of the document', async () => {
      process.env.FEATURE_IDENTITY = 'false';

      const response = await request(server).get(DOCUMENT).expect(200);

      process.env.FEATURE_IDENTITY = 'true';
      expect(JSON.stringify(response.body)).not.toContain('/auth/');
    });
  });
});
