import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { SecretBox } from './secret-box.js';

// 32 bytes obviamente falsos, generados para esta prueba.
const KEY = Buffer.alloc(32, 7).toString('base64');
const OTHER_KEY = Buffer.alloc(32, 9).toString('base64');
const SECRET = 'JBSWY3DPEHPK3PXP';

describe('SecretBox', () => {
  let box: SecretBox;

  beforeEach(() => {
    process.env.AUTH_TOTP_ENCRYPTION_KEY = KEY;
    box = new SecretBox();
  });

  afterEach(() => {
    delete process.env.AUTH_TOTP_ENCRYPTION_KEY;
  });

  it('gives back exactly what was sealed', () => {
    expect(box.open(box.seal(SECRET))).toBe(SECRET);
  });

  it('does not leave the secret readable in what it stores', () => {
    expect(box.seal(SECRET)).not.toContain(SECRET);
  });

  // Sin un IV nuevo cada vez, dos cuentas con el mismo secreto se verían iguales en la base.
  it('seals the same secret differently every time', () => {
    expect(box.seal(SECRET)).not.toBe(box.seal(SECRET));
  });

  it('handles a secret with accents and spaces', () => {
    const awkward = 'ñandú con espacios y 🔒';

    expect(box.open(box.seal(awkward))).toBe(awkward);
  });

  describe('refusing what it should not open', () => {
    it('rejects a secret sealed with another key', () => {
      const sealed = box.seal(SECRET);
      process.env.AUTH_TOTP_ENCRYPTION_KEY = OTHER_KEY;

      expect(() => box.open(sealed)).toThrow();
    });

    // AES-GCM autentica: tocar un byte del texto cifrado se nota, no se descifra a basura.
    it('notices a tampered ciphertext', () => {
      const parts = box.seal(SECRET).split('.');
      const tampered = Buffer.from(parts[2] ?? '', 'base64url');
      tampered[0] = (tampered[0] ?? 0) ^ 0xff;
      parts[2] = tampered.toString('base64url');

      expect(() => box.open(parts.join('.'))).toThrow();
    });

    it('rejects something that is not in the expected shape', () => {
      expect(() => box.open('no-tiene-tres-partes')).toThrow(/formato/i);
    });
  });

  describe('the key', () => {
    it('refuses to work without one', () => {
      delete process.env.AUTH_TOTP_ENCRYPTION_KEY;

      expect(() => box.seal(SECRET)).toThrow('AUTH_TOTP_ENCRYPTION_KEY is not set');
    });

    it('refuses an empty one', () => {
      process.env.AUTH_TOTP_ENCRYPTION_KEY = '';

      expect(() => box.seal(SECRET)).toThrow('AUTH_TOTP_ENCRYPTION_KEY is not set');
    });

    it('refuses one that is not 32 bytes', () => {
      process.env.AUTH_TOTP_ENCRYPTION_KEY = Buffer.alloc(16, 1).toString('base64');

      expect(() => box.seal(SECRET)).toThrow(/32 bytes/);
    });

    it('never puts the key in the error', () => {
      const short = Buffer.alloc(16, 1).toString('base64');
      process.env.AUTH_TOTP_ENCRYPTION_KEY = short;

      const error = (() => {
        try {
          box.seal(SECRET);
        } catch (thrown) {
          return thrown as Error;
        }

        return new Error('no lanzó');
      })();
      expect(error.message).not.toContain(short);
    });
  });
});
