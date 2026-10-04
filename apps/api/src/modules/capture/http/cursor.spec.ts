import { describe, expect, it } from 'vitest';

import { InvalidCaptureCursorError } from '../domain/errors.js';
import { decodeCaptureCursor, encodeCaptureCursor } from './cursor.js';

const POSITION = {
  occurredAt: new Date('2026-10-03T16:30:00.000Z'),
  id: '01999999-9999-7999-8999-000000000001',
};

describe('capture cursor', () => {
  it('gives back the position it encoded', () => {
    expect(decodeCaptureCursor(encodeCaptureCursor(POSITION))).toEqual(POSITION);
  });

  it.each([
    ['text that is not base64', '%%%'],
    ['something else in base64', Buffer.from('["hola"]').toString('base64url')],
    [
      'a position with a bad id',
      Buffer.from('["2026-10-03T16:30:00.000Z","1"]').toString('base64url'),
    ],
  ])('rejects %s', (_label, cursor) => {
    expect(() => decodeCaptureCursor(cursor)).toThrow(InvalidCaptureCursorError);
  });
});
