'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';

import { useSession } from '@/shared/session/session-provider';

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // La sesión ya reintenta un 401 una vez; un 4xx no se arregla reintentando.
        retry: false,
        staleTime: 30_000,
      },
    },
  });
}

interface QueryProviderProps {
  children: ReactNode;
  /** Para las pruebas. */
  client?: QueryClient;
}

/**
 * Caché de datos de la API. **Se vacía al terminar la sesión** (cierre, caducidad u otra pestaña):
 * sin eso, quien entre después en el mismo navegador vería por un instante los datos del anterior.
 */
export function QueryProvider({ children, client: given }: Readonly<QueryProviderProps>) {
  const [client] = useState(() => given ?? createQueryClient());
  const session = useSession();

  useEffect(
    () =>
      session.subscribe(() => {
        if (session.status === 'anonymous') client.clear();
      }),
    [session, client],
  );

  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
