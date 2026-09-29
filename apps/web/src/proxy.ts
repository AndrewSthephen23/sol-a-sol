import { NextResponse, type NextRequest } from 'next/server';

import { contentSecurityPolicy, newNonce } from '@/shared/security/csp';

/** Donde escucha la API en desarrollo local (`pnpm dev:local`). */
export const DEFAULT_API_URL = 'http://localhost:3001';

const API_PREFIX = '/api/';

/**
 * Delante de toda petición a la web, dos trabajos:
 *
 * 1. **`/api/*` se reenvía a la API**, así el navegador habla con un solo origen: la cookie de
 *    refresco (`SameSite=Strict`, `Path=/api/v1/auth`) viaja sin CORS y la API no necesita una
 *    URL pública. `API_URL` se lee en cada petición, no al construir: la imagen publicada se
 *    construye una vez y recibe la dirección al arrancar. El destino se arma cambiando solo la
 *    ruta y la query sobre el origen de la API, nunca resolviendo la ruta como URL: así ninguna
 *    ruta puede apuntar a otro host.
 *
 *    `X-Forwarded-For` pasa tal como llega, y Next no le agrega la IP real si ya viene una: por
 *    eso la API no debe fiarse de esa cabecera (`TRUST_PROXY=0`) salvo que delante de la web haya
 *    un proxy inverso que la reescriba. Ver `docs/modules/identity.md`.
 *
 * 2. **Cada página lleva su política de contenido** con un nonce nuevo (`shared/security/csp.ts`).
 *    Next lee el nonce de la cabecera de la petición y se lo pone a sus scripts; por eso toda
 *    página se renderiza por petición.
 */
export function proxy(request: NextRequest): NextResponse {
  if (request.nextUrl.pathname.startsWith(API_PREFIX)) return toApi(request);

  const policy = contentSecurityPolicy(newNonce(), process.env.NODE_ENV === 'development');
  const headers = new Headers(request.headers);
  headers.set('Content-Security-Policy', policy);
  const response = NextResponse.next({ request: { headers } });
  response.headers.set('Content-Security-Policy', policy);

  return response;
}

function toApi(request: NextRequest): NextResponse {
  const target = new URL(process.env.API_URL ?? DEFAULT_API_URL);
  target.pathname = request.nextUrl.pathname;
  target.search = request.nextUrl.search;

  return NextResponse.rewrite(target);
}

export const config = {
  matcher: [
    '/api/:path*',
    // Las páginas; no los archivos estáticos, que no ejecutan nada. Las precargas de `next/link`
    // tampoco: la política llega con la navegación de verdad.
    {
      source: '/((?!api/|_next/static|_next/image|favicon.ico).*)',
      missing: [
        { type: 'header', key: 'next-router-prefetch' },
        { type: 'header', key: 'purpose', value: 'prefetch' },
      ],
    },
  ],
};
