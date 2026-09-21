import { Logger } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ARGON2_OPTIONS, Argon2PasswordHasher } from './argon2-password-hasher.js';

const PASSWORD = 'caballo grapa batería';

describe('Argon2PasswordHasher', () => {
  let hasher: Argon2PasswordHasher;

  beforeEach(() => {
    hasher = new Argon2PasswordHasher();
  });

  it('produces an argon2id hash carrying the OWASP parameters', async () => {
    const hash = await hasher.hash(PASSWORD);

    expect(hash.startsWith('$argon2id$')).toBe(true);
    expect(hash).toContain(`m=${String(ARGON2_OPTIONS.memoryCost)}`);
    expect(hash).toContain(`t=${String(ARGON2_OPTIONS.timeCost)}`);
    expect(hash).toContain(`p=${String(ARGON2_OPTIONS.parallelism)}`);
  });

  it('never stores the password inside the hash', async () => {
    expect(await hasher.hash(PASSWORD)).not.toContain(PASSWORD);
  });

  it('accepts the right password', async () => {
    const hash = await hasher.hash(PASSWORD);

    await expect(hasher.verify(PASSWORD, hash)).resolves.toBe(true);
  });

  it('rejects a wrong password without throwing', async () => {
    const hash = await hasher.hash(PASSWORD);

    await expect(hasher.verify('otra cosa', hash)).resolves.toBe(false);
  });

  it('rejects a password that only differs in case', async () => {
    const hash = await hasher.hash(PASSWORD);

    await expect(hasher.verify(PASSWORD.toUpperCase(), hash)).resolves.toBe(false);
  });

  describe('when the stored hash is not a hash', () => {
    it('fails closed instead of throwing', async () => {
      vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);

      await expect(hasher.verify(PASSWORD, 'esto no es un hash')).resolves.toBe(false);
    });

    it('warns, so a permanently unusable account leaves a trace', async () => {
      const warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);

      await hasher.verify(PASSWORD, 'esto no es un hash');

      expect(warn).toHaveBeenCalledOnce();
      // El aviso no puede llevar ni la contraseña ni el hash.
      expect(String(warn.mock.calls[0]?.[0])).not.toContain(PASSWORD);
    });
  });
});
