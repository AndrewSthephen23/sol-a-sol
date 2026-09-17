/**
 * Describe un valor rechazado para el mensaje de un error de dominio.
 * Los textos van entre comillas (`"EUR"`) para distinguir `"undefined"` de `undefined`.
 */
export function describeValue(value: unknown): string {
  return typeof value === 'string' ? JSON.stringify(value) : String(value);
}
