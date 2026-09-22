import type { INestApplication } from '@nestjs/common';

import { ProblemDetailsFilter } from './shared/http/problem-details.filter.js';

export const API_PREFIX = 'api/v1';

/** Lo mínimo de Express para decirle en quién confiar, sin atar la API entera a él. */
interface ProxyAwareAdapter {
  set(setting: string, value: unknown): void;
}

/**
 * Configuración compartida entre `main.ts` y las pruebas de integración,
 * para que ambas levanten la API exactamente igual.
 */
export function configureApp(app: INestApplication): void {
  // Los health checks quedan fuera del prefijo: los consultan Docker y el balanceador, no los clientes.
  app.setGlobalPrefix(API_PREFIX, { exclude: ['health', 'health/ready'] });
  // Todo error sale en Problem Details (RFC 9457), incluidos los 404 de rutas que no existen.
  app.useGlobalFilters(new ProblemDetailsFilter());
  trustProxy(app);
}

/**
 * De cuántos proxies fiarse para saber la IP de quien llama (`TRUST_PROXY`).
 *
 * Importa porque la IP decide el tope de peticiones y el bloqueo por intentos: detrás de un
 * proxy sin esto, **todas** las peticiones parecerían venir de la misma IP —la del proxy— y un
 * solo atacante bloquearía a todo el mundo. Confiar de más es peor todavía: cualquiera podría
 * mandar `X-Forwarded-For` y aparentar una IP distinta en cada intento. Por eso viene apagado y
 * se indica **cuántos** saltos hay delante, en vez de un `true` que se cree cualquier cosa.
 */
function trustProxy(app: INestApplication): void {
  const hops = Number(process.env.TRUST_PROXY ?? '0');
  if (!Number.isInteger(hops) || hops <= 0) return;

  (app.getHttpAdapter().getInstance() as ProxyAwareAdapter).set('trust proxy', hops);
}
