/** Un texto sin espacios en los bordes, o `null` si no queda nada: vacío es «no vino». */
export function cleanText(text: string | null): string | null {
  const trimmed = text?.trim() ?? '';
  return trimmed === '' ? null : trimmed;
}
