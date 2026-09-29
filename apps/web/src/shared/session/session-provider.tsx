'use client';

import { createContext, useContext, useEffect, useState, useSyncExternalStore } from 'react';
import type { ReactNode } from 'react';

import { type ApiClient, createApiClient } from '@/shared/api/client';

import { Session, type SessionStatus } from './session';

interface SessionContextValue {
  session: Session;
  api: ApiClient;
}

const SessionContext = createContext<SessionContextValue | null>(null);

/** La sesión del navegador, con sus locks y su canal entre pestañas cuando existen. */
function browserSession(): Session {
  return new Session({
    fetch: (input, init) => globalThis.fetch(input, init),
    ...('locks' in navigator ? { locks: navigator.locks } : {}),
    ...('BroadcastChannel' in globalThis
      ? { channel: new BroadcastChannel('sol-a-sol:session') }
      : {}),
  });
}

function serverPlaceholder(): Session {
  return new Session({
    fetch: () => Promise.reject(new Error('There is no session on the server.')),
  });
}

interface SessionProviderProps {
  children: ReactNode;
  /** Para las pruebas; en el navegador se crea una al montar. */
  session?: Session;
}

/**
 * Una sola sesión y un solo cliente de API para toda la web. Al montar intenta recuperar la
 * sesión con la cookie de refresco: hasta que responde, el estado es `unknown`.
 */
export function SessionProvider({ children, session: given }: Readonly<SessionProviderProps>) {
  const [value] = useState<SessionContextValue>(() => {
    // El servidor también renderiza este componente, pero ahí no hay sesión ni se llama a la API:
    // las pantallas privadas se dibujan en el navegador. Recibe una inerte que nunca se usa.
    const inBrowser = typeof window !== 'undefined';
    const session = given ?? (inBrowser ? browserSession() : serverPlaceholder());
    // Rutas absolutas: `Request` no resuelve una relativa fuera de una página.
    const baseUrl = inBrowser ? window.location.origin : 'http://localhost';

    return { session, api: createApiClient({ baseUrl, fetch: session.fetch }) };
  });

  useEffect(() => {
    void value.session.restore();
  }, [value]);

  return <SessionContext value={value}>{children}</SessionContext>;
}

function useSessionContext(): SessionContextValue {
  const value = useContext(SessionContext);
  if (value === null) throw new Error('useSession must be used inside <SessionProvider>.');

  return value;
}

export function useSession(): Session {
  return useSessionContext().session;
}

export function useApi(): ApiClient {
  return useSessionContext().api;
}

export function useSessionStatus(): SessionStatus {
  const session = useSession();

  // En el servidor no hay sesión que conocer: se renderiza como `unknown`.
  return useSyncExternalStore(session.subscribe, session.getStatus, () => 'unknown');
}
