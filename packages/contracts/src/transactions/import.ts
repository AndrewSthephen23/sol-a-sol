import { z } from 'zod';

/** Límites de un archivo de importación (decididos con el autor el 2026-09-28). */
export const IMPORT_MAX_BYTES = 1_048_576;
export const IMPORT_MAX_ROWS = 5000;

/**
 * El archivo viaja como **texto** dentro del JSON: la web lo lee y lo manda. No se guarda. Que no
 * pase de 1 MB (medido en bytes) y de 5 000 filas lo comprueba la API al leerlo.
 */
export const importPreviewRequestSchema = z.strictObject({
  csv: z.string().min(1),
});

export type ImportPreviewRequest = z.infer<typeof importPreviewRequestSchema>;
