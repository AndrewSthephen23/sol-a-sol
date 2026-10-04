import { describe, expect, it } from 'vitest';

import { cleanText } from './clean-text.js';

describe('cleanText', () => {
  it('trims a text', () => {
    expect(cleanText('  Tambo ')).toBe('Tambo');
  });

  it.each([null, '', '   '])('turns %j into nothing', (text) => {
    expect(cleanText(text)).toBeNull();
  });
});
