/**
 * La sesión viaja en una cookie que **JavaScript no puede leer** (`httpOnly`), que solo sale por
 * HTTPS (`Secure`) y que el navegador no manda desde otro sitio (`SameSite=Strict`), lo que
 * corta de raíz el CSRF sobre estos endpoints. Los navegadores tratan `http://localhost` como
 * contexto seguro, así que `Secure` no estorba en desarrollo.
 */
export const REFRESH_COOKIE = 'sol_a_sol_refresh';

/** La cookie solo se manda a los endpoints de sesión, no a toda la API. */
const COOKIE_PATH = '/api/v1/auth';

const BASE_OPTIONS = {
  httpOnly: true,
  secure: true,
  sameSite: 'strict',
  path: COOKIE_PATH,
} as const;

/** Lo mínimo que se necesita de la respuesta, para no atar esto a Express. */
export interface CookieResponse {
  cookie(name: string, value: string, options: Record<string, unknown>): void;
  clearCookie(name: string, options: Record<string, unknown>): void;
}

export function setRefreshCookie(response: CookieResponse, value: string, expiresAt: Date): void {
  response.cookie(REFRESH_COOKIE, value, { ...BASE_OPTIONS, expires: expiresAt });
}

export function clearRefreshCookie(response: CookieResponse): void {
  // Los mismos atributos que al ponerla: el navegador solo borra la que coincide en path.
  response.clearCookie(REFRESH_COOKIE, BASE_OPTIONS);
}

/**
 * Lee una cookie de la cabecera `Cookie`.
 *
 * Se parsea a mano en vez de sumar `cookie-parser`: solo hace falta leer un nombre, y el valor
 * es base64url, que no lleva ningún carácter que haya que desescapar.
 */
export function readRefreshCookie(header: string | undefined): string | undefined {
  if (header === undefined) return undefined;

  for (const part of header.split(';')) {
    const separator = part.indexOf('=');
    if (separator === -1) continue;

    if (part.slice(0, separator).trim() === REFRESH_COOKIE) {
      // Una cookie puede venir entrecomillada (RFC 6265).
      return part
        .slice(separator + 1)
        .trim()
        .replace(/^"(.*)"$/, '$1');
    }
  }

  return undefined;
}
