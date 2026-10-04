import { createParamDecorator, type ExecutionContext } from '@nestjs/common';

/**
 * La cabecera `Idempotency-Key` tal cual llegó. Va como decorador propio porque `@Headers` no
 * acepta pipes, y así se valida con su esquema igual que el cuerpo.
 */
export const IdempotencyKey = createParamDecorator(
  (_data: unknown, context: ExecutionContext) =>
    context.switchToHttp().getRequest<{ headers: Record<string, unknown> }>().headers[
      'idempotency-key'
    ],
);
