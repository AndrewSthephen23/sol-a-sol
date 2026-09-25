import { LocalDate } from '@sol-a-sol/domain';
import { describe, expect, it } from 'vitest';

import { InvalidCursorError } from '../domain/errors.js';
import { decodeCursor, encodeCursor } from './cursor.js';

const POSITION = {
  date: LocalDate.of(2026, 9, 24),
  id: '01999999-9999-7999-8999-000000000001',
};

function encoded(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

describe('cursor', () => {
  it('gives back the position it was made from', () => {
    const decoded = decodeCursor(encodeCursor(POSITION));

    expect(decoded.date.equals(POSITION.date)).toBe(true);
    expect(decoded.id).toBe(POSITION.id);
  });

  it('is safe to put in a URL as it is', () => {
    expect(encodeCursor(POSITION)).toMatch(/^[\w-]+$/u);
  });

  it.each([
    ['not base64 JSON', () => 'no-es-un-cursor'],
    ['a JSON of another shape', () => encoded({ date: '2026-09-24' })],
    ['a date that does not exist', () => encoded(['2026-02-30', POSITION.id])],
    ['an id that is not a UUID', () => encoded(['2026-09-24', '42'])],
    ['extra parts', () => encoded(['2026-09-24', POSITION.id, 'x'])],
  ])('rejects %s', (_case, cursor) => {
    expect(() => decodeCursor(cursor())).toThrow(InvalidCursorError);
  });
});
