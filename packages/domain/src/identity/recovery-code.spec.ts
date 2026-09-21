import { describe, expect, it } from 'vitest';

import {
  formatRecoveryCode,
  normalizeRecoveryCode,
  RECOVERY_CODE_ALPHABET,
  RECOVERY_CODE_COUNT,
  RECOVERY_CODE_LENGTH,
} from './recovery-code.js';

describe('the shape of a recovery code', () => {
  it('hands out ten of them', () => {
    expect(RECOVERY_CODE_COUNT).toBe(10);
  });

  it('uses twelve characters, which is about sixty bits of randomness', () => {
    expect(RECOVERY_CODE_LENGTH).toBe(12);
    expect(RECOVERY_CODE_ALPHABET).toHaveLength(32);
  });

  // Se copian a mano de un papel: I y 1, O y 0, se confunden al leerlas.
  it('leaves out the letters that look like digits', () => {
    for (const confusing of ['I', 'L', 'O', 'U']) {
      expect(RECOVERY_CODE_ALPHABET).not.toContain(confusing);
    }
  });

  it('has no repeated symbol', () => {
    expect(new Set(RECOVERY_CODE_ALPHABET).size).toBe(RECOVERY_CODE_ALPHABET.length);
  });
});

describe('formatRecoveryCode', () => {
  it('breaks it into groups of four, which is easier to copy by hand', () => {
    expect(formatRecoveryCode('ABCDEFGHJKMN')).toBe('ABCD-EFGH-JKMN');
  });

  it('leaves a shorter last group alone instead of padding it', () => {
    expect(formatRecoveryCode('ABCDEFGHJK')).toBe('ABCD-EFGH-JK');
  });

  it('formats a single group without adding a dash', () => {
    expect(formatRecoveryCode('ABCD')).toBe('ABCD');
  });

  it('gives nothing back for nothing, without inventing a separator', () => {
    expect(formatRecoveryCode('')).toBe('');
  });
});

describe('normalizeRecoveryCode', () => {
  it('accepts it exactly as it was shown', () => {
    expect(normalizeRecoveryCode('ABCD-EFGH-JKMN')).toBe('ABCDEFGHJKMN');
  });

  it('accepts it typed without the dashes', () => {
    expect(normalizeRecoveryCode('ABCDEFGHJKMN')).toBe('ABCDEFGHJKMN');
  });

  it('accepts it typed in lower case', () => {
    expect(normalizeRecoveryCode('abcd-efgh-jkmn')).toBe('ABCDEFGHJKMN');
  });

  it('ignores spaces, which get in the way of copying', () => {
    expect(normalizeRecoveryCode('  ABCD EFGH JKMN  ')).toBe('ABCDEFGHJKMN');
  });

  it('ignores every kind of separator someone might type', () => {
    expect(normalizeRecoveryCode('ABCD_EFGH.JKMN')).toBe('ABCDEFGHJKMN');
  });

  it('leaves alone what is not a separator, so a wrong code stays wrong', () => {
    expect(normalizeRecoveryCode('ABCD-EFGH-JKMÑ')).toBe('ABCDEFGHJKMÑ');
  });
});
