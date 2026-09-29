export const HOME = '/';

const LOGIN = '/login';
const BASE = 'http://sol-a-sol.invalid';

/**
 * A dónde volver después de entrar, sacado de `?next=`. Solo se acepta una ruta de la propia
 * web: cualquier otra cosa lleva al inicio, o el login serviría para mandar a alguien, recién
 * autenticado, a una página ajena (redirección abierta).
 *
 * Se decide resolviendo el valor como URL y comparando el origen, no mirando el texto: `//otro`,
 * `/\otro` o `https:otro` parecen rutas y el navegador los lleva a otro sitio.
 */
export function safeNext(value: string | null): string {
  if (!value?.startsWith('/')) return HOME;

  let url: URL;
  try {
    url = new URL(value, BASE);
  } catch {
    return HOME;
  }
  if (url.origin !== BASE || url.pathname === LOGIN) return HOME;

  return `${url.pathname}${url.search}${url.hash}`;
}

/** La URL del login que, al entrar, vuelve a `path`. */
export function loginUrl(path: string): string {
  const next = safeNext(path);

  return next === HOME ? LOGIN : `${LOGIN}?next=${encodeURIComponent(next)}`;
}
