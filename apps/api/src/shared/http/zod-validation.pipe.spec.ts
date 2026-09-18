import { describe, expect, it } from 'vitest';
import { z, ZodError } from 'zod';

import { ZodValidationPipe } from './zod-validation.pipe.js';

const schema = z.object({ email: z.string().trim().toLowerCase() });

describe('ZodValidationPipe', () => {
  it('returns the value already normalised by the schema', () => {
    const pipe = new ZodValidationPipe(schema);

    expect(pipe.transform({ email: '  Ana@Example.COM  ' })).toEqual({
      email: 'ana@example.com',
    });
  });

  // No lo atrapa a propósito: `ProblemDetailsFilter` es quien decide cómo se ve un error de
  // validación, para que el formato se defina en un solo sitio.
  it('lets the ZodError bubble up to the global filter', () => {
    const pipe = new ZodValidationPipe(schema);

    expect(() => pipe.transform({ email: 42 })).toThrow(ZodError);
  });
});
