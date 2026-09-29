import { NextResponse, type NextRequest } from 'next/server';

/** Donde escucha la API en desarrollo local (`pnpm dev:local`). */
export const DEFAULT_API_URL = 'http://localhost:3001';

/**
 * Reenvía `/api/*` a la API, así el navegador habla con un solo origen: la cookie de refresco
 * (`SameSite=Strict`, `Path=/api/v1/auth`) viaja sin CORS y la API no necesita una URL pública.
 *
 * `API_URL` se lee en cada petición, no al construir: la imagen publicada se construye una vez
 * y recibe la dirección de la API al arrancar. Los `rewrites` de `next.config` no sirven para
 * eso, porque quedan fijados en el build.
 *
 * El destino se arma cambiando solo la ruta y la query sobre el origen de la API, nunca
 * resolviendo la ruta como URL: así ninguna ruta puede apuntar a otro host.
 *
 * `X-Forwarded-For` pasa tal como llega, y Next no le agrega la IP real si ya viene una: por eso
 * la API no debe fiarse de esa cabecera (`TRUST_PROXY=0`) salvo que delante de la web haya un
 * proxy inverso que la reescriba. Ver `docs/modules/identity.md`.
 */
export function proxy(request: NextRequest): NextResponse {
  const target = new URL(process.env.API_URL ?? DEFAULT_API_URL);
  target.pathname = request.nextUrl.pathname;
  target.search = request.nextUrl.search;

  return NextResponse.rewrite(target);
}

export const config = { matcher: '/api/:path*' };
