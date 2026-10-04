import { describe, expect, it } from 'vitest';

import { parseNotification } from './parse-notification.js';

// Vitest lee los fixtures con `import.meta.glob` de Vite, sin `node:fs`: el paquete no tiene tipos
// de Node (`types: []`). Se declara solo la forma que se usa, en vez de depender de `vite`.
declare global {
  interface ImportMeta {
    glob<T>(
      pattern: string,
      options: { query?: string; import?: string; eager: true },
    ): Record<string, T>;
  }
}

/**
 * Todas las notificaciones de `fixtures/<fuente>/` contra su `.expected.json`. Agregar un banco
 * es agregar sus fixtures y su parser: esta prueba no se toca.
 */
const texts = import.meta.glob<string>('../fixtures/**/*.txt', {
  query: '?raw',
  import: 'default',
  eager: true,
});
const expectations = import.meta.glob<unknown>('../fixtures/**/*.expected.json', {
  import: 'default',
  eager: true,
});

const cases = Object.entries(texts).map(([path, text]) => ({
  name: path.replace('../fixtures/', '').replace(/\.txt$/u, ''),
  text,
  expected: expectations[path.replace(/\.txt$/u, '.expected.json')],
}));

describe('notification fixtures', () => {
  it('has fixtures to read', () => {
    expect(cases.length).toBeGreaterThan(0);
  });

  it('has a text for every expectation', () => {
    const withText = new Set(Object.keys(texts).map((path) => path.replace(/\.txt$/u, '')));
    const orphans = Object.keys(expectations).filter(
      (path) => !withText.has(path.replace(/\.expected\.json$/u, '')),
    );

    expect(orphans).toEqual([]);
  });

  it.each(cases)('reads $name', ({ text, expected }) => {
    expect(expected, 'falta su .expected.json').toBeDefined();
    // Los editores agregan un salto de línea al final del archivo: no es parte de la notificación.
    const parsed = parseNotification(text.replace(/\n$/u, ''));

    expect({
      source: parsed.source,
      kind: parsed.kind,
      amount: parsed.amount?.toFixed() ?? null,
      currency: parsed.amount?.currency ?? null,
      merchant: parsed.merchant,
      cardLast4: parsed.cardLast4,
      warnings: parsed.warnings,
    }).toEqual(expected);
  });
});
