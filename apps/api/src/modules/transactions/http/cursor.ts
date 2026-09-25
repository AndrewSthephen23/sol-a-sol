import { LocalDate } from '@sol-a-sol/domain';
import { z } from 'zod';

import { InvalidCursorError } from '../domain/errors.js';
import type { PagePosition } from '../ports/transaction-repository.js';

const positionSchema = z.tuple([z.iso.date(), z.uuid()]);

/**
 * El cursor es **opaco** para quien llama: la web lo devuelve tal cual y nunca lo arma. Por
 * dentro es la posición de la última fila entregada, en base64url, para que cambiarla después no
 * rompa ningún contrato.
 */
export function encodeCursor(position: PagePosition): string {
  return Buffer.from(JSON.stringify([position.date.toString(), position.id])).toString('base64url');
}

/** Lanza `InvalidCursorError` con cualquier cosa que no haya salido de `encodeCursor`. */
export function decodeCursor(cursor: string): PagePosition {
  try {
    const [date, id] = positionSchema.parse(
      JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')),
    );

    return { date: LocalDate.parse(date), id };
  } catch {
    throw new InvalidCursorError();
  }
}
