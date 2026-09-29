/**
 * Puertos propios de los E2E, para no chocar con `pnpm dev` (3000 y 3001).
 *
 * `localhost` y no `127.0.0.1`: la cookie de refresco es `Secure`, y el navegador solo la acepta
 * por HTTP en `localhost`, que trata como contexto seguro.
 */
export const WEB_PORT = 3100;
export const API_PORT = 3101;
export const WEB_URL = `http://localhost:${String(WEB_PORT)}`;
export const API_URL = `http://localhost:${String(API_PORT)}`;

/** Lo que el setup global deja a las pruebas: los workers heredan su `process.env`. */
export const INVITE_CODE_VAR = 'E2E_INVITE_CODE';
