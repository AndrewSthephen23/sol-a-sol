'use client';

import { useSyncExternalStore } from 'react';
import type { ReactNode } from 'react';

const noSubscription = () => () => undefined;

/**
 * Dibuja `children` solo en el navegador, después de hidratar. Recharts pone estilos en línea: en
 * el HTML del servidor la CSP (sin `'unsafe-inline'`) los bloquearía, y desde el navegador van por
 * CSSOM (`element.style`), que la CSP permite.
 */
export function ClientOnly({
  children,
  fallback = null,
}: Readonly<{ children: ReactNode; fallback?: ReactNode }>) {
  const isClient = useSyncExternalStore(
    noSubscription,
    () => true,
    () => false,
  );

  return isClient ? children : fallback;
}
