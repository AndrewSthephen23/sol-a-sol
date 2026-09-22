import type { ExecutionContext } from '@nestjs/common';
import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { seconds, ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';

import { API_PREFIX } from '../../app.setup.js';
import {
  AUTH_RATE_LIMIT,
  DEFAULT_RATE_LIMIT,
  isAuthPath,
  isHealthPath,
  RATE_LIMIT_WINDOW_SECONDS,
  rateLimitFrom,
} from './rate-limits.js';

/**
 * Tope de peticiones por IP, para que nadie inunde la API.
 *
 * Hay dos topes y cada petición cae en **uno**: el estricto si va a `/auth`, el general si no.
 * Se decide aquí por la ruta, y no con decoradores en cada controller, porque así los valores
 * se leen del entorno al arrancar y no al importar el archivo.
 *
 * El almacén es de memoria, que es lo correcto mientras la API corra en **un** proceso: si
 * algún día hay varias réplicas, el contador tendrá que mudarse a algo compartido (Redis), o
 * cada réplica dejará pasar su propio cupo.
 */
@Module({
  imports: [
    ThrottlerModule.forRootAsync({
      // Sin `imports`, pero la firma asíncrona los exige; lo que importa es que la fábrica
      // corre al arrancar, así que los topes salen del entorno de verdad y no del de la compilación.
      imports: [],
      useFactory: () => [
        {
          name: 'default',
          ttl: seconds(RATE_LIMIT_WINDOW_SECONDS),
          limit: rateLimitFrom(process.env.RATE_LIMIT_PER_MINUTE, DEFAULT_RATE_LIMIT),
          skipIf: (context: ExecutionContext) => isHealth(context) || isAuth(context),
        },
        {
          name: 'auth',
          ttl: seconds(RATE_LIMIT_WINDOW_SECONDS),
          limit: rateLimitFrom(process.env.AUTH_RATE_LIMIT_PER_MINUTE, AUTH_RATE_LIMIT),
          skipIf: (context: ExecutionContext) => !isAuth(context),
        },
      ],
    }),
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class ThrottlingModule {}

function urlOf(context: ExecutionContext): string | undefined {
  return context.switchToHttp().getRequest<{ url?: string }>().url;
}

function isAuth(context: ExecutionContext): boolean {
  return isAuthPath(urlOf(context), API_PREFIX);
}

function isHealth(context: ExecutionContext): boolean {
  return isHealthPath(urlOf(context));
}
