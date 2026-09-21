import { describe, expect, it } from 'vitest';

import { COMMON_PASSWORDS } from './common-passwords.js';
import {
  assertPasswordIsStrong,
  PASSWORD_MIN_LENGTH,
  PasswordTooCommonError,
  PasswordTooShortError,
  WeakPasswordError,
} from './password-policy.js';

const STRONG = 'caballo grapa batería';

/** `expect(...).toThrow()` necesita una función sin valor de retorno. */
function checking(password: string): () => void {
  return () => {
    assertPasswordIsStrong(password);
  };
}

describe('assertPasswordIsStrong', () => {
  it('accepts a long password with no digits or capitals', () => {
    expect(checking(STRONG)).not.toThrow();
  });

  describe('length', () => {
    it(`accepts exactly ${String(PASSWORD_MIN_LENGTH)} characters`, () => {
      expect(checking('abcdefghijkm')).not.toThrow();
    });

    it('rejects one character below the minimum', () => {
      expect(checking('abcdefghijk')).toThrow(PasswordTooShortError);
    });

    it('rejects an empty password', () => {
      expect(checking('')).toThrow(PasswordTooShortError);
    });

    it('counts characters, not UTF-16 units: an emoji is one character', () => {
      expect(checking('🔒'.repeat(PASSWORD_MIN_LENGTH))).not.toThrow();
    });

    it('rejects eleven emojis, which would be twenty-two units', () => {
      expect(checking('🔒'.repeat(PASSWORD_MIN_LENGTH - 1))).toThrow(PasswordTooShortError);
    });

    // Un emoji de familia son 8 unidades UTF-16 y 5 puntos de código, pero un solo carácter:
    // contándolos mal, tres de ellos pasarían el mínimo de doce.
    it('rejects three family emojis, which are three characters, not fifteen', () => {
      expect(checking('👨‍👩‍👧'.repeat(3))).toThrow(PasswordTooShortError);
    });

    it('does not trim: spaces are part of the password', () => {
      expect(checking(' '.repeat(PASSWORD_MIN_LENGTH))).not.toThrow();
    });
  });

  describe('common passwords', () => {
    it('rejects one that is on the list', () => {
      expect(checking('password123456')).toThrow(PasswordTooCommonError);
    });

    it('ignores capitalisation, because it fools nobody', () => {
      expect(checking('PassWord123456')).toThrow(PasswordTooCommonError);
    });

    it('rejects a long keyboard run', () => {
      expect(checking('qwertyuiopasdfgh')).toThrow(PasswordTooCommonError);
    });

    it('accepts a password that merely contains a common one', () => {
      expect(checking('password123456 y mi gato')).not.toThrow();
    });
  });

  describe('the error it raises', () => {
    it('reports the minimum length, which is useful to the person typing', () => {
      const error = new PasswordTooShortError();

      expect(error.code).toBe('PASSWORD_TOO_SHORT');
      expect(error.message).toContain(String(PASSWORD_MIN_LENGTH));
    });

    it('says what to do without explaining why the password is common', () => {
      const error = new PasswordTooCommonError();

      expect(error.code).toBe('PASSWORD_TOO_COMMON');
      // Un mensaje vacío dejaría a quien llama sin nada que registrar ni que mostrar.
      expect(error.message).toContain('Choose a different one');
      // Decir de dónde sale la lista sería decirle al atacante qué evitar.
      expect(error.message).not.toMatch(/list|lista|common|común/i);
    });

    it('never puts the password in the message', () => {
      const secret = 'password123456';
      let message: string | undefined;

      try {
        assertPasswordIsStrong(secret);
      } catch (error) {
        message = (error as Error).message;
      }

      expect(message).toBeDefined();
      expect(message).not.toContain(secret);
    });

    it('lets both failures be caught as a single kind', () => {
      expect(checking('corta')).toThrow(WeakPasswordError);
      expect(checking('password123456')).toThrow(WeakPasswordError);
    });

    it('checks the length first, so a short common password reports its length', () => {
      // `qwerty` empieza una entrada de la lista y además es corta: gana el fallo más concreto.
      expect(checking('qwerty')).toThrow(PasswordTooShortError);
    });
  });
});

describe('the common password list', () => {
  // Una entrada más corta que el mínimo nunca se llega a comparar: la longitud la rechaza antes.
  it('has no entry shorter than the minimum length, which would be dead weight', () => {
    const tooShort = COMMON_PASSWORDS.filter((entry) => entry.length < PASSWORD_MIN_LENGTH);

    expect(tooShort).toEqual([]);
  });

  it('is stored in lower case, because the check lowercases what it compares', () => {
    const notLowered = COMMON_PASSWORDS.filter((entry) => entry !== entry.toLowerCase());

    expect(notLowered).toEqual([]);
  });

  it('has no duplicates', () => {
    expect(new Set(COMMON_PASSWORDS).size).toBe(COMMON_PASSWORDS.length);
  });

  it('is not empty, or the rule would be silently doing nothing', () => {
    expect(COMMON_PASSWORDS.length).toBeGreaterThan(0);
  });
});
