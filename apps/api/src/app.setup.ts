import type { INestApplication } from '@nestjs/common';
import helmet from 'helmet';

import { ALLOWED_HEADERS, ALLOWED_METHODS, webOriginsFrom } from './shared/http/cors.js';
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
  secureHeaders(app);
  restrictCors(app);
}

/**
 * Cabeceras de seguridad (helmet).
 *
 * La política de contenido no se desactiva: se cierra **entera**. Esto sirve JSON y nunca carga
 * nada, así que `default-src 'none'` es exacto, y es más estricto que la política por defecto de
 * helmet, pensada para páginas. Si algún día una respuesta acabara interpretándose como HTML
 * —por un error, o por un navegador viejo adivinando el tipo—, no podría cargar ni ejecutar nada.
 *
 * `frame-ancestors 'none'` impide meter la API en un iframe (y es lo que sustituye a
 * `X-Frame-Options` en los navegadores actuales); `form-action` y `base-uri` cierran los dos
 * caminos por los que un HTML inyectado mandaría datos a otra parte.
 */
function secureHeaders(app: INestApplication): void {
  app.use(
    helmet({
      contentSecurityPolicy: {
        useDefaults: false,
        directives: {
          'default-src': ["'none'"],
          'frame-ancestors': ["'none'"],
          'form-action': ["'none'"],
          'base-uri': ["'none'"],
        },
      },
    }),
  );
}

/**
 * CORS restringido al dominio de la web (`WEB_ORIGIN`).
 *
 * Con credenciales, porque la sesión viaja en una cookie; por eso mismo la lista es cerrada y
 * nunca `*`: el navegador ni siquiera acepta esa combinación, y de aceptarla, cualquier página
 * podría hacer peticiones en nombre de quien tenga la sesión abierta.
 */
function restrictCors(app: INestApplication): void {
  app.enableCors({
    origin: webOriginsFrom(process.env.WEB_ORIGIN),
    credentials: true,
    methods: ALLOWED_METHODS,
    allowedHeaders: ALLOWED_HEADERS,
    maxAge: 600,
  });
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
