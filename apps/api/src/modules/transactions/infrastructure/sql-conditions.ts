import { ACCENT_FOLD_FROM, ACCENT_FOLD_TO } from '@sol-a-sol/domain';

import { Prisma } from '../../../generated/prisma/client.js';
import type { PagePosition } from '../ports/transaction-repository.js';

/**
 * Condiciones SQL que comparten los listados de transacciones y de transferencias. Todo valor va
 * como parámetro (`Prisma.sql`), nunca pegado al texto de la consulta.
 */

/**
 * Filas **después** de la posición, en el orden del listado (fecha descendente y luego id
 * descendente). Comparar la fila entera respeta el orden sin casos aparte para el empate.
 */
export function afterPosition(after: PagePosition): Prisma.Sql {
  return Prisma.sql`(date, id) < (${after.date.toString()}::date, ${after.id}::uuid)`;
}

/**
 * Alguna de las columnas contiene el texto, sin distinguir mayúsculas ni tildes. La tabla de
 * acentos es la de `searchKey` (dominio), que ya normalizó lo buscado: la misma para los dos.
 */
export function containsText(columns: readonly Prisma.Sql[], search: string): Prisma.Sql {
  // `%` y `_` son comodines de LIKE: buscados, valen como letras.
  const pattern = `%${search.replaceAll(/[\\%_]/gu, (char) => `\\${char}`)}%`;
  const matches = columns.map(
    (column) =>
      Prisma.sql`lower(translate(${column}, ${ACCENT_FOLD_FROM}, ${ACCENT_FOLD_TO})) LIKE ${pattern}`,
  );

  return Prisma.sql`(${Prisma.join(matches, ' OR ')})`;
}
