import { z } from 'zod';

import { TAG_NAME_MAX_LENGTH } from './transactions.js';

/**
 * Renombra una etiqueta. Que no esté vacía ni lleve `|` lo decide el dominio (`TAG_NAME_INVALID`).
 *
 * Si el nombre nuevo es el de **otra** etiqueta de la cuenta (sin mayúsculas ni tildes), las dos
 * se **fusionan**: sus transacciones quedan con la otra, que toma la escritura mandada, y esta
 * desaparece (decidido con el autor el 2026-09-28).
 */
export const renameTagRequestSchema = z.strictObject({
  name: z.string().max(TAG_NAME_MAX_LENGTH),
});

export type RenameTagRequest = z.infer<typeof renameTagRequestSchema>;
