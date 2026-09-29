/**
 * La política de contenido de las páginas, con un **nonce nuevo en cada petición**: solo corren
 * los scripts que Next marca con él, y `'strict-dynamic'` deja cargar los que esos traen. Un
 * script inyectado (XSS) no tiene el nonce y no corre; es lo que protege al token de acceso, que
 * vive en memoria.
 *
 * - Sin `'unsafe-inline'` en scripts ni estilos: la web no usa ninguno en línea.
 * - `connect-src 'self'`: la web solo habla con su propio origen (la API va por `/api/*`).
 * - `frame-ancestors 'none'`: nadie la puede meter en un iframe (clickjacking).
 * - Sin `upgrade-insecure-requests`: en desarrollo y en los E2E se sirve por HTTP en `localhost`.
 *   El TLS es del despliegue (H8), igual que HSTS.
 *
 * En desarrollo React usa `eval` para reconstruir las pilas de error y el overlay inyecta
 * estilos: solo ahí se permiten `'unsafe-eval'` y estilos en línea. Nunca en producción.
 */
export function contentSecurityPolicy(nonce: string, development: boolean): string {
  const directives: [string, ...string[]][] = [
    ['default-src', "'self'"],
    [
      'script-src',
      "'self'",
      `'nonce-${nonce}'`,
      "'strict-dynamic'",
      ...(development ? ["'unsafe-eval'"] : []),
    ],
    ['style-src', "'self'", ...(development ? ["'unsafe-inline'"] : [`'nonce-${nonce}'`])],
    ['img-src', "'self'", 'blob:', 'data:'],
    ['font-src', "'self'"],
    ['connect-src', "'self'"],
    ['object-src', "'none'"],
    ['base-uri', "'self'"],
    ['form-action', "'self'"],
    ['frame-ancestors', "'none'"],
  ];

  return directives.map((directive) => directive.join(' ')).join('; ');
}

/** 128 bits aleatorios en base64: imposible de adivinar, distinto en cada petición. */
export function newNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);

  return btoa(String.fromCharCode(...bytes));
}
