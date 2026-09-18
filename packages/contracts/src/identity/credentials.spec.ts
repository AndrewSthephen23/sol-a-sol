import { describe, expect, it } from 'vitest';

import {
  EMAIL_MAX_LENGTH,
  loginRequestSchema,
  PASSWORD_MAX_LENGTH,
  registerRequestSchema,
} from './credentials.js';

const VALID = { email: 'ana@example.com', password: 'una contraseña larga' };

describe('register request', () => {
  it('accepts an email and a password', () => {
    expect(registerRequestSchema.parse(VALID)).toEqual(VALID);
  });

  it('normalises the email, because users.email is unique', () => {
    const parsed = registerRequestSchema.parse({ ...VALID, email: '  Ana@Example.COM  ' });

    expect(parsed.email).toBe('ana@example.com');
  });

  it('rejects text that is not an email', () => {
    const result = registerRequestSchema.safeParse({ ...VALID, email: 'ana-arroba-example' });

    expect(result.success).toBe(false);
  });

  it('rejects an email longer than RFC 5321 allows', () => {
    const tooLong = `${'a'.repeat(EMAIL_MAX_LENGTH)}@example.com`;

    expect(registerRequestSchema.safeParse({ ...VALID, email: tooLong }).success).toBe(false);
  });

  it('rejects a password past the defensive limit, so argon2id cannot be abused', () => {
    const tooLong = 'a'.repeat(PASSWORD_MAX_LENGTH + 1);

    expect(registerRequestSchema.safeParse({ ...VALID, password: tooLong }).success).toBe(false);
  });

  // El mínimo de 12 caracteres y la lista de filtradas son política de negocio y viven en
  // `@sol-a-sol/domain` (tarea 03 de H2). Aquí solo se valida la forma.
  it('does not judge how strong the password is', () => {
    expect(registerRequestSchema.safeParse({ ...VALID, password: 'corta' }).success).toBe(true);
  });

  it('keeps the password exactly as it was typed, spaces included', () => {
    const parsed = registerRequestSchema.parse({ ...VALID, password: '  con espacios  ' });

    expect(parsed.password).toBe('  con espacios  ');
  });

  it('rejects a request with a missing field', () => {
    expect(registerRequestSchema.safeParse({ email: VALID.email }).success).toBe(false);
  });
});

describe('login request', () => {
  it('accepts a login without a second factor', () => {
    expect(loginRequestSchema.parse(VALID)).toEqual(VALID);
  });

  it('accepts a login with a TOTP code', () => {
    const parsed = loginRequestSchema.parse({ ...VALID, totpCode: ' 123456 ' });

    expect(parsed.totpCode).toBe('123456');
  });
});
