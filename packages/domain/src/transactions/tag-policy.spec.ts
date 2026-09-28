import { describe, expect, it } from 'vitest';

import {
  InvalidTagNameError,
  MAX_TAGS_PER_TRANSACTION,
  normalizeTags,
  TooManyTagsError,
} from './tag-policy.js';

describe('normalizeTags', () => {
  it('keeps each tag with the key it is compared by', () => {
    expect(normalizeTags(['Almuerzo', 'viaje-cusco'])).toEqual([
      { name: 'Almuerzo', key: 'almuerzo' },
      { name: 'viaje-cusco', key: 'viaje-cusco' },
    ]);
  });

  it('trims the names', () => {
    expect(normalizeTags(['  oficina '])).toEqual([{ name: 'oficina', key: 'oficina' }]);
  });

  // "Almuerzo", "ALMUERZO" y "almuerzó" son la misma etiqueta: se queda la primera escritura.
  it('collapses the same tag written in different ways, keeping the first spelling', () => {
    expect(normalizeTags(['Almuerzo', 'ALMUERZO', 'almuerzó', 'cena'])).toEqual([
      { name: 'Almuerzo', key: 'almuerzo' },
      { name: 'cena', key: 'cena' },
    ]);
  });

  it('keeps the ñ as its own letter', () => {
    expect(normalizeTags(['año', 'ano']).map((tag) => tag.key)).toEqual(['año', 'ano']);
  });

  it('accepts no tags', () => {
    expect(normalizeTags([])).toEqual([]);
  });

  it.each(['', '   '])('rejects the blank tag %j', (name) => {
    expect(() => normalizeTags([name])).toThrow(InvalidTagNameError);
  });

  // `|` separa las etiquetas en el CSV: dentro de una sería imposible de importar.
  it('rejects a tag with |', () => {
    expect(() => normalizeTags(['almuerzo|cena'])).toThrow(InvalidTagNameError);
  });

  it(`accepts up to ${String(MAX_TAGS_PER_TRANSACTION)} different tags`, () => {
    const names = Array.from(
      { length: MAX_TAGS_PER_TRANSACTION },
      (_, index) => `t${String(index)}`,
    );

    expect(normalizeTags(names)).toHaveLength(MAX_TAGS_PER_TRANSACTION);
  });

  it('rejects more different tags than that', () => {
    const names = Array.from(
      { length: MAX_TAGS_PER_TRANSACTION + 1 },
      (_, index) => `t${String(index)}`,
    );

    expect(() => normalizeTags(names)).toThrow(TooManyTagsError);
  });

  it('counts a repeated tag once', () => {
    const names = [
      ...Array.from({ length: MAX_TAGS_PER_TRANSACTION }, (_, index) => `t${String(index)}`),
      'T0',
    ];

    expect(normalizeTags(names)).toHaveLength(MAX_TAGS_PER_TRANSACTION);
  });
});

describe('errors', () => {
  it.each([
    ['InvalidTagNameError', () => new InvalidTagNameError(), 'TAG_NAME_INVALID', /\|/],
    ['TooManyTagsError', () => new TooManyTagsError(), 'TOO_MANY_TAGS', /at most 10/],
  ])('%s has a stable code and says which rule broke', (name, build, code, message) => {
    const error = build();

    expect(error.code).toBe(code);
    expect(error.message).toMatch(message);
    expect(error.name).toBe(name);
  });
});
