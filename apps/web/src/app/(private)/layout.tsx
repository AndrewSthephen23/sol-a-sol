import { Suspense } from 'react';
import type { ReactNode } from 'react';

import { isFeatureEnabled } from '@/shared/navigation/feature-flags';
import { featureManifests } from '@/shared/navigation/registry';
import { Sidebar } from '@/shared/navigation/sidebar';
import { LogoutButton } from '@/shared/session/logout-button';
import { RequireSession } from '@/shared/session/require-session';

/**
 * Todas las pantallas de este grupo exigen sesión. Se dibujan en el navegador (decisión 3 de
 * H3): el token vive en memoria, así que el servidor no tiene con qué pedir datos.
 */
export default function PrivateLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    // `RequireSession` lee la query para volver a ella después del login: sin `Suspense`, Next
    // no podría prerenderizar el resto de la página.
    <Suspense>
      <RequireSession>
        <Sidebar
          manifests={featureManifests}
          isEnabled={isFeatureEnabled}
          actions={<LogoutButton />}
        />
        {children}
      </RequireSession>
    </Suspense>
  );
}
