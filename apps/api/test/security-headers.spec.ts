import type { Server } from 'node:http';

import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';

import { AppModule } from '../src/app.module.js';
import { API_PREFIX, configureApp } from '../src/app.setup.js';

const OPENAPI = `/${API_PREFIX}/openapi.json`;
const WEB = 'https://sol-a-sol.pe';
const OTHER = 'https://sitio-que-no-es-mio.example';

describe('security headers and CORS', () => {
  let app: INestApplication;
  let server: Server;

  beforeAll(async () => {
    process.env.DATABASE_URL = inject('databaseUrl');
    process.env.WEB_ORIGIN = WEB;
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    server = app.getHttpServer() as Server;
  });

  afterAll(async () => {
    delete process.env.WEB_ORIGIN;
    await app.close();
  });

  describe('helmet', () => {
    it('tells the browser not to guess the type of a response', async () => {
      const response = await request(server).get(OPENAPI).expect(200);

      expect(response.headers['x-content-type-options']).toBe('nosniff');
    });

    it('does not let the API be framed', async () => {
      const response = await request(server).get(OPENAPI).expect(200);

      expect(response.headers['x-frame-options']).toBe('SAMEORIGIN');
    });

    // Decir con qué está hecha solo ayuda a quien busca una versión con agujeros.
    it('does not announce what it is made with', async () => {
      const response = await request(server).get(OPENAPI).expect(200);

      expect(response.headers['x-powered-by']).toBeUndefined();
    });

    it('asks for HTTPS from now on', async () => {
      const response = await request(server).get(OPENAPI).expect(200);

      expect(response.headers['strict-transport-security']).toContain('max-age=');
    });

    // Esto sirve JSON y no carga nada, así que la política puede cerrarse entera: es más
    // estricta que la de por defecto, que está pensada para páginas.
    it('closes the content policy completely', async () => {
      const response = await request(server).get(OPENAPI).expect(200);

      const policy = response.headers['content-security-policy'];
      expect(policy).toContain("default-src 'none'");
      expect(policy).toContain("frame-ancestors 'none'");
      expect(policy).toContain("form-action 'none'");
      expect(policy).toContain("base-uri 'none'");
    });

    // Nada de lo que sirve la API debería poder ejecutarse en un navegador.
    it('does not allow scripts from anywhere', async () => {
      const response = await request(server).get(OPENAPI).expect(200);

      expect(response.headers['content-security-policy']).not.toContain("'unsafe-inline'");
    });
  });

  describe('CORS', () => {
    it('lets the web call it, with its cookies', async () => {
      const response = await request(server).get(OPENAPI).set('Origin', WEB).expect(200);

      expect(response.headers['access-control-allow-origin']).toBe(WEB);
      expect(response.headers['access-control-allow-credentials']).toBe('true');
    });

    it('does not answer to any other site', async () => {
      const response = await request(server).get(OPENAPI).set('Origin', OTHER).expect(200);

      expect(response.headers['access-control-allow-origin']).toBeUndefined();
    });

    // Con credenciales, `*` ni siquiera es válido para el navegador; y de serlo, cualquier
    // página podría llamar a la API en nombre de quien tenga la sesión abierta.
    it('never opens up to every origin', async () => {
      const response = await request(server).get(OPENAPI).set('Origin', OTHER).expect(200);

      expect(response.headers['access-control-allow-origin']).not.toBe('*');
    });

    it('answers the preflight with only the methods and headers it uses', async () => {
      const response = await request(server)
        .options(`/${API_PREFIX}/auth/login`)
        .set('Origin', WEB)
        .set('Access-Control-Request-Method', 'POST')
        .expect(204);

      expect(response.headers['access-control-allow-methods']).toBe(
        'GET,POST,PATCH,DELETE,OPTIONS',
      );
      expect(response.headers['access-control-allow-headers']).toBe(
        'Content-Type,Authorization,X-Request-Id',
      );
    });
  });
});
