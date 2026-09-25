/**
 * Letras con acento y su reemplazo, **en el orden en que las usa `translate()` de PostgreSQL**:
 * la base busca con `lower(translate(texto, ACCENT_FOLD_FROM, ACCENT_FOLD_TO))`, y `searchKey`
 * hace lo mismo aquí. Una sola tabla para los dos lados.
 *
 * Trae las mayúsculas porque, con el locale C de la base, `lower('É')` devuelve 'É'. Por lo mismo
 * la Ñ pasa a ñ. **La ñ no pierde nada**: no es una tilde sino otra letra, y "Año" y "Ano" son
 * palabras distintas.
 */
export const ACCENT_FOLD_FROM = 'ÁÉÍÓÚÀÈÌÒÙÄËÏÖÜÑáéíóúàèìòùäëïöü';
export const ACCENT_FOLD_TO = 'AEIOUAEIOUAEIOUñaeiouaeiouaeiou';

const ACCENT_PATTERN = new RegExp(`[${ACCENT_FOLD_FROM}]`, 'gu');

/**
 * La forma de un texto con la que se compara o se busca: sin espacios en los bordes, en
 * minúsculas y sin acentos. "Café", "CAFE" y " cafe " dan lo mismo.
 */
export function searchKey(text: string): string {
  return text
    .trim()
    .replaceAll(ACCENT_PATTERN, (letter) => ACCENT_FOLD_TO.charAt(ACCENT_FOLD_FROM.indexOf(letter)))
    .toLowerCase();
}
