import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';

import { Module } from '@nestjs/common';
import { LoggerModule } from 'nestjs-pino';

import { API_PREFIX } from '../../app.setup.js';

/** Cabeceras que **nunca** deben acabar en un log: llevan credenciales enteras. */
export const REDACTED = [
  'req.headers.authorization',
  'req.headers.cookie',
  'res.headers["set-cookie"]',
];

/** Lo que se escribe en su lugar. */
export const CENSOR = '[Redacted]';

/** Petición ya autenticada: el guard deja ahí el `userId`. */
interface LoggedRequest extends IncomingMessage {
  userId?: string;
}

/**
 * Logs en JSON con `pino`.
 *
 * Cada línea trae `requestId`, el `userId` (el identificador, nunca el correo), el módulo que
 * atendió y cuánto tardó. Las credenciales se enmascaran: la cabecera `Authorization` y las
 * cookies salen como `[Redacted]`, así que un log no sirve para suplantar a nadie.
 */
@Module({ imports: [LoggerModule.forRoot({ pinoHttp: pinoHttpOptions() })] })
export class LoggingModule {}

/** La configuración de pino, aparte para poder probarla sin levantar la aplicación. */
export function pinoHttpOptions() {
  return {
    level: process.env.LOG_LEVEL ?? 'info',
    // Se respeta el que traiga la petición, para poder seguirla entre servicios.
    genReqId: (request: IncomingMessage): string =>
      firstHeader(request.headers['x-request-id']) ?? randomUUID(),
    redact: { paths: REDACTED, censor: CENSOR },
    customProps: (request: IncomingMessage): Record<string, string | undefined> => ({
      userId: (request as LoggedRequest).userId,
      module: moduleOf(request.url),
    }),
    // Los health checks los consulta Docker cada pocos segundos: llenarían el log.
    autoLogging: { ignore: (request: IncomingMessage): boolean => isHealthPath(request.url) },
    customSuccessMessage: (request: IncomingMessage, response: ServerResponse): string =>
      `${request.method ?? '?'} ${request.url ?? '?'} ${String(response.statusCode)}`,
  };
}

/**
 * Si la petición es un health check. Solo decide si la línea se escribe o no: aquí mirar la URL
 * no abre ninguna puerta, al revés que en el tope de caudal.
 */
function isHealthPath(url: string | undefined): boolean {
  const path = (url ?? '').split('?')[0] ?? '';

  return path === '/health' || path.startsWith('/health/');
}

function firstHeader(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];

  return value === '' ? undefined : value;
}

/** Qué módulo atiende la ruta: `/api/v1/auth/login` → `auth`. Sirve para filtrar los logs. */
export function moduleOf(url: string | undefined): string {
  const path = (url ?? '').split('?')[0] ?? '';
  const segments = path.split('/').filter((segment) => segment !== '');
  const prefixLength = API_PREFIX.split('/').length;

  return path.startsWith(`/${API_PREFIX}/`) ? (segments[prefixLength] ?? '') : (segments[0] ?? '');
}
