import { describe, expect, it } from 'vitest';

import { ACCENT_FOLD_FROM, ACCENT_FOLD_TO, searchKey } from './search-key.js';

describe('searchKey', () => {
  it.each([
    ['Café', 'cafe'],
    ['CAFÉ', 'cafe'],
    ['  menú del día ', 'menu del dia'],
    ['PINGÜINO', 'pinguino'],
    ['àèìòù', 'aeiou'],
  ])('reads %j as %j', (text, key) => {
    expect(searchKey(text)).toBe(key);
  });

  // La ñ no es una tilde sino otra letra: "Año" y "Ano" son palabras distintas.
  it('keeps the ñ, also in uppercase', () => {
    expect(searchKey('AÑO Niño')).toBe('año niño');
  });

  it('leaves the rest as it is', () => {
    expect(searchKey('Tambo 24/7 #3')).toBe('tambo 24/7 #3');
  });
});

/**
 * La base busca con `lower(translate(texto, ACCENT_FOLD_FROM, ACCENT_FOLD_TO))`. Estas pruebas
 * atan esa tabla a `searchKey`: si una cambia sin la otra, la búsqueda deja de encontrar.
 */
describe('accent folding table for the database', () => {
  // Todas las letras de la tabla ocupan una sola unidad UTF-16: `charAt` las lee enteras.
  it('pairs every letter with its replacement', () => {
    expect(ACCENT_FOLD_FROM).toHaveLength(ACCENT_FOLD_TO.length);
  });

  it('folds each letter to what searchKey gives, once in lowercase', () => {
    for (let index = 0; index < ACCENT_FOLD_FROM.length; index += 1) {
      const letter = ACCENT_FOLD_FROM.charAt(index);

      expect(searchKey(letter), letter).toBe(ACCENT_FOLD_TO.charAt(index).toLowerCase());
    }
  });

  // Con el locale C de la base, `lower('É')` devuelve 'É': las mayúsculas tienen que estar.
  it('includes the uppercase letters, which lower() in the C locale would not fold', () => {
    expect(ACCENT_FOLD_FROM).toContain('É');
    expect(ACCENT_FOLD_FROM).toContain('Ñ');
  });
});
