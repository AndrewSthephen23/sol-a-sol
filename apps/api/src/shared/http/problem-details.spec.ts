import { describe, expect, it } from 'vitest';

import { buildProblem, problemType } from './problem-details.js';

describe('problemType', () => {
  it('builds a stable URN from the error code', () => {
    expect(problemType('INVALID_AMOUNT')).toBe('urn:sol-a-sol:error:invalid-amount');
  });

  it('replaces every underscore, not just the first', () => {
    expect(problemType('INVALID_AMOUNT_TEXT')).toBe('urn:sol-a-sol:error:invalid-amount-text');
  });

  it('leaves a code without underscores alone beyond lowercasing', () => {
    expect(problemType('CONFLICT')).toBe('urn:sol-a-sol:error:conflict');
  });
});

describe('buildProblem', () => {
  const base = { status: 404, code: 'NOT_FOUND', title: 'Not found', detail: 'No existe.' };

  it('builds the four fields the RFC requires', () => {
    expect(buildProblem(base)).toEqual({
      type: 'urn:sol-a-sol:error:not-found',
      title: 'Not found',
      status: 404,
      detail: 'No existe.',
    });
  });

  it('includes errors when there are field failures', () => {
    const errors = [{ field: 'email', code: 'INVALID_FORMAT', message: 'Invalid email' }];

    expect(buildProblem({ ...base, errors })).toMatchObject({ errors });
  });

  // Un `errors: []` haría creer a la web que hay detalles por campo que mostrar.
  it('omits errors entirely when the list is empty', () => {
    expect(buildProblem({ ...base, errors: [] })).not.toHaveProperty('errors');
  });

  it('omits errors when none are given', () => {
    expect(buildProblem(base)).not.toHaveProperty('errors');
  });
});
