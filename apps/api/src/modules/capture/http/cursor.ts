import { z } from 'zod';

import { InvalidCaptureCursorError } from '../domain/errors.js';
import type { CapturePosition } from '../ports/capture-repository.js';

const positionSchema = z.tuple([z.iso.datetime(), z.uuid()]);

/**
 * El cursor es **opaco** para quien llama, como el de las transacciones: la posición de la última
 * captura entregada (su instante y su id), en base64url.
 */
export function encodeCaptureCursor(position: CapturePosition): string {
  return Buffer.from(JSON.stringify([position.occurredAt.toISOString(), position.id])).toString(
    'base64url',
  );
}

/** Lanza `InvalidCaptureCursorError` con cualquier cosa que no haya salido de `encodeCaptureCursor`. */
export function decodeCaptureCursor(cursor: string): CapturePosition {
  try {
    const [occurredAt, id] = positionSchema.parse(
      JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')),
    );

    return { occurredAt: new Date(occurredAt), id };
  } catch {
    throw new InvalidCaptureCursorError();
  }
}
