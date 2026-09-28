import { describe, expect, it } from 'vitest';

import { renameTagRequestSchema } from './tags.js';
import { TAG_NAME_MAX_LENGTH } from './transactions.js';

function accepts(body: unknown): boolean {
  return renameTagRequestSchema.safeParse(body).success;
}

describe('rename tag request', () => {
  it('accepts a name', () => {
    expect(renameTagRequestSchema.parse({ name: 'Delivery' })).toEqual({ name: 'Delivery' });
  });

  // Vacío o con `|` lo rechaza el dominio, diciendo qué regla rompe.
  it.each(['', 'a|b'])('leaves the name %j to the domain', (name) => {
    expect(accepts({ name })).toBe(true);
  });

  it.each([
    ['no name', {}],
    ['a name too long', { name: 'x'.repeat(TAG_NAME_MAX_LENGTH + 1) }],
    ['a name that is not text', { name: 42 }],
    ['an unknown field', { name: 'Delivery', color: '#FFFFFF' }],
  ])('rejects %s', (_case, body) => {
    expect(accepts(body)).toBe(false);
  });
});
