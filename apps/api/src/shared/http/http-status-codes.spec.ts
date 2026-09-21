import { describe, expect, it } from 'vitest';

import { codeForStatus, titleForStatus } from './http-status-codes.js';

describe('codeForStatus', () => {
  it('maps a known status to its stable code', () => {
    expect(codeForStatus(404)).toBe('NOT_FOUND');
    expect(codeForStatus(422)).toBe('UNPROCESSABLE_ENTITY');
  });

  it('falls back to the number so an unmapped status still has a code', () => {
    expect(codeForStatus(418)).toBe('HTTP_418');
  });
});

describe('titleForStatus', () => {
  it('maps a known status to its title', () => {
    expect(titleForStatus(401)).toBe('Unauthorized');
  });

  it('falls back to the number so an unmapped status still has a title', () => {
    expect(titleForStatus(418)).toBe('HTTP 418');
  });
});
