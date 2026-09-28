import { describe, expect, it } from 'vitest';

import { importPreviewRequestSchema } from './import.js';

describe('import preview request', () => {
  it('accepts the file as text', () => {
    expect(importPreviewRequestSchema.parse({ csv: 'fecha,tipo\n' })).toEqual({
      csv: 'fecha,tipo\n',
    });
  });

  it.each([{}, { csv: '' }, { csv: 42 }, { csv: 'a', userId: 'b' }])('rejects %j', (body) => {
    expect(importPreviewRequestSchema.safeParse(body).success).toBe(false);
  });
});
