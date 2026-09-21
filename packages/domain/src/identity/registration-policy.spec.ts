import { describe, expect, it } from 'vitest';

import {
  isRegistrationAllowed,
  REGISTRATION_MODES,
  type RegistrationMode,
  toRegistrationMode,
} from './registration-policy.js';

const INVITE = 'codigo-de-invitacion';

function allowed(
  mode: RegistrationMode,
  overrides: Partial<Parameters<typeof isRegistrationAllowed>[0]> = {},
) {
  return isRegistrationAllowed({ mode, hasAnyUser: false, ...overrides });
}

describe('toRegistrationMode', () => {
  it.each(REGISTRATION_MODES)('accepts the known mode %s', (mode) => {
    expect(toRegistrationMode(mode)).toBe(mode);
  });

  // Cualquier duda se resuelve cerrando, igual que con los feature flags: un error de tipeo
  // nunca debe abrir el registro al mundo.
  it('falls back to closed when the value is not a known mode', () => {
    expect(toRegistrationMode('abierto')).toBe('closed');
  });

  it('falls back to closed when the variable is not set', () => {
    expect(toRegistrationMode(undefined)).toBe('closed');
  });

  it('falls back to closed when the value is empty', () => {
    expect(toRegistrationMode('')).toBe('closed');
  });

  it('does not accept a mode written with different capitalisation', () => {
    expect(toRegistrationMode('OPEN')).toBe('closed');
  });
});

describe('isRegistrationAllowed', () => {
  describe('closed', () => {
    it('lets the very first person register, who becomes the owner', () => {
      expect(allowed('closed', { hasAnyUser: false })).toBe(true);
    });

    it('turns nobody else away once an account exists', () => {
      expect(allowed('closed', { hasAnyUser: true })).toBe(false);
    });

    it('ignores any invite code that arrives', () => {
      expect(
        allowed('closed', { hasAnyUser: true, providedInvite: INVITE, expectedInvite: INVITE }),
      ).toBe(false);
    });
  });

  describe('open', () => {
    it('lets anyone register', () => {
      expect(allowed('open', { hasAnyUser: true })).toBe(true);
    });
  });

  describe('invite', () => {
    it('accepts the right code', () => {
      expect(allowed('invite', { providedInvite: INVITE, expectedInvite: INVITE })).toBe(true);
    });

    it('accepts the right code even once other accounts exist', () => {
      expect(
        allowed('invite', { hasAnyUser: true, providedInvite: INVITE, expectedInvite: INVITE }),
      ).toBe(true);
    });

    it('rejects a wrong code', () => {
      expect(allowed('invite', { providedInvite: 'otro', expectedInvite: INVITE })).toBe(false);
    });

    // Sin esta prueba, quitar la comparación carácter a carácter no rompería nada: la longitud
    // sola ya coincidiría y cualquier código del tamaño correcto entraría.
    it('rejects a wrong code of exactly the same length', () => {
      const wrong = 'x'.repeat(INVITE.length);

      expect(wrong).toHaveLength(INVITE.length);
      expect(allowed('invite', { providedInvite: wrong, expectedInvite: INVITE })).toBe(false);
    });

    it('rejects a code that differs only in the last character', () => {
      const wrong = `${INVITE.slice(0, -1)}X`;

      expect(allowed('invite', { providedInvite: wrong, expectedInvite: INVITE })).toBe(false);
    });

    it('rejects a code that differs only in the first character', () => {
      const wrong = `X${INVITE.slice(1)}`;

      expect(allowed('invite', { providedInvite: wrong, expectedInvite: INVITE })).toBe(false);
    });

    it('rejects a code that is a prefix of the right one', () => {
      expect(
        allowed('invite', { providedInvite: INVITE.slice(0, 5), expectedInvite: INVITE }),
      ).toBe(false);
    });

    it('rejects a missing code', () => {
      expect(allowed('invite', { expectedInvite: INVITE })).toBe(false);
    });

    // Sin código configurado, el modo invitación no puede dejar entrar a nadie: si no,
    // olvidar la variable de entorno abriría el registro con un código vacío.
    it('rejects everything when no code is configured', () => {
      expect(allowed('invite', { providedInvite: '' })).toBe(false);
      expect(allowed('invite', { providedInvite: 'lo que sea' })).toBe(false);
    });

    it('rejects an empty code even if the configured one is empty too', () => {
      expect(allowed('invite', { providedInvite: '', expectedInvite: '' })).toBe(false);
    });
  });
});
