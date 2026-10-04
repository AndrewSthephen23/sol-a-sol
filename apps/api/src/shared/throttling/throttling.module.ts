import type { ExecutionContext } from '@nestjs/common';
import { Module } from '@nestjs/common';
import { APP_GUARD, Reflector } from '@nestjs/core';
import { seconds, ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';

import {
  AUTH_RATE_LIMIT,
  CAPTURE_RATE_LIMIT,
  DEFAULT_RATE_LIMIT,
  RATE_LIMIT_BUCKET,
  RATE_LIMIT_WINDOW_SECONDS,
  type RateLimitBucket,
  rateLimitFrom,
} from './rate-limits.js';

const reflector = new Reflector();

/**
 * Tope de peticiones por IP, para que nadie inunde la API.
 *
 * Hay tres topes y cada petición cae en **uno**: el de `/auth` si la ruta está marcada con
 * `@StrictRateLimit()`, el de las capturas si lo está con `@CaptureRateLimit()`, y el general si
 * no. Se decide por la metadata del controller y **nunca**
 * por el texto de la URL, que quien llama controla. Los valores se leen del entorno al
 * arrancar, no al importar el archivo, así que una prueba puede fijarlos.
 *
 * El almacén es de memoria, que es lo correcto mientras la API corra en **un** proceso: si
 * algún día hay varias réplicas, el contador tendrá que mudarse a algo compartido (Redis), o
 * cada réplica dejará pasar su propio cupo.
 */
@Module({
  imports: [
    ThrottlerModule.forRootAsync({
      // La firma asíncrona los exige aunque no haga falta ninguno.
      imports: [],
      useFactory: () => [
        {
          name: 'default',
          ttl: seconds(RATE_LIMIT_WINDOW_SECONDS),
          limit: rateLimitFrom(process.env.RATE_LIMIT_PER_MINUTE, DEFAULT_RATE_LIMIT),
          skipIf: (context: ExecutionContext) => bucketOf(context) !== undefined,
        },
        {
          name: 'auth',
          ttl: seconds(RATE_LIMIT_WINDOW_SECONDS),
          limit: rateLimitFrom(process.env.AUTH_RATE_LIMIT_PER_MINUTE, AUTH_RATE_LIMIT),
          skipIf: (context: ExecutionContext) => bucketOf(context) !== 'auth',
        },
        {
          name: 'captures',
          ttl: seconds(RATE_LIMIT_WINDOW_SECONDS),
          limit: rateLimitFrom(process.env.CAPTURE_RATE_LIMIT_PER_MINUTE, CAPTURE_RATE_LIMIT),
          skipIf: (context: ExecutionContext) => bucketOf(context) !== 'captures',
        },
      ],
    }),
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class ThrottlingModule {}

function bucketOf(context: ExecutionContext): RateLimitBucket | undefined {
  return reflector.getAllAndOverride<RateLimitBucket | undefined>(RATE_LIMIT_BUCKET, [
    context.getHandler(),
    context.getClass(),
  ]);
}
