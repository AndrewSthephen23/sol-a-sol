'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect } from 'react';
import type { ReactNode } from 'react';

import { loginUrl } from './safe-next';
import { useSessionStatus } from './session-provider';

/**
 * Muestra su contenido solo con sesión. Sin ella manda a `/login`, recordando a dónde se quería
 * ir; mientras se sabe (al recargar, la sesión se recupera con la cookie), no muestra nada.
 *
 * Es la puerta de la interfaz, no la de los datos: esa la cierra la API, que responde 401 a toda
 * petición sin token. Aquí solo se evita dibujar una pantalla que no podría cargar nada.
 */
export function RequireSession({ children }: { children: ReactNode }) {
  const status = useSessionStatus();
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams().toString();

  useEffect(() => {
    if (status === 'anonymous')
      router.replace(loginUrl(search ? `${pathname}?${search}` : pathname));
  }, [status, router, pathname, search]);

  if (status !== 'authenticated') {
    return (
      <p role="status" className="px-4 py-12 text-center text-sm text-stone-500">
        Cargando tu sesión…
      </p>
    );
  }

  return children;
}
