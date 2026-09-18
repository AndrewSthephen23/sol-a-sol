import { Injectable, type PipeTransform } from '@nestjs/common';
import type { ZodType } from 'zod';

/**
 * Valida la entrada con un esquema de `@sol-a-sol/contracts` y devuelve el valor ya normalizado
 * (por ejemplo, el correo en minúsculas).
 *
 * No atrapa el `ZodError`: lo deja subir para que `ProblemDetailsFilter` lo traduzca, así el
 * formato de los errores de validación se decide en un solo sitio.
 */
@Injectable()
export class ZodValidationPipe<T> implements PipeTransform<unknown, T> {
  constructor(private readonly schema: ZodType<T>) {}

  transform(value: unknown): T {
    return this.schema.parse(value);
  }
}
