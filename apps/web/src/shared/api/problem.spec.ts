import { describe, expect, it } from 'vitest';

import { errorMessage, GENERIC_ERROR, problemCode, tooManyAttemptsMessage } from './problem';

describe('problemCode', () => {
  it('reads the stable code back from the URN in type', () => {
    expect(problemCode({ type: 'urn:sol-a-sol:error:totp-required', status: 401 })).toBe(
      'TOTP_REQUIRED',
    );
  });

  it.each([
    ['a body without type', { status: 500 }],
    ['a type from someone else', { type: 'about:blank' }],
    ['a type that is not text', { type: 42 }],
    ['something that is not an object', 'Bad Gateway'],
    ['nothing', null],
  ])('gives null for %s', (_case, body) => {
    expect(problemCode(body)).toBeNull();
  });
});

describe('errorMessage', () => {
  it('translates a known code to Spanish', () => {
    expect(errorMessage('INVALID_CREDENTIALS')).toBe('El correo o la contraseña no son correctos.');
  });

  it('falls back to a generic message, never to the English detail', () => {
    expect(errorMessage('SOMETHING_NEW')).toBe(GENERIC_ERROR);
    expect(errorMessage(null)).toBe(GENERIC_ERROR);
  });
});

describe('tooManyAttemptsMessage', () => {
  it.each([
    ['1', 'en 1 segundo'],
    ['45', 'en 45 segundos'],
    ['60', 'en 1 minuto'],
    ['61', 'en 2 minutos'],
    ['900', 'en 15 minutos'],
  ])('rounds Retry-After %s up to %s', (retryAfter, expected) => {
    expect(tooManyAttemptsMessage(retryAfter)).toContain(expected);
  });

  it.each([null, '', 'soon', '0', '-5'])(
    'asks to wait a moment when Retry-After is %j',
    (value) => {
      expect(tooManyAttemptsMessage(value)).toBe(
        'Demasiados intentos. Espera un momento antes de volver a intentarlo.',
      );
    },
  );
});
