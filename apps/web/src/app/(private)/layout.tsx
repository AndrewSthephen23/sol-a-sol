import { connection } from 'next/server';
import { Suspense } from 'react';
import type { ReactNode } from 'react';

import { UndoProvider } from '@/shared/feedback/undo-toast';
import { isFeatureEnabled } from '@/shared/navigation/feature-flags';
import { featureManifests } from '@/shared/navigation/registry';
import { Sidebar } from '@/shared/navigation/sidebar';
import { LogoutButton } from '@/shared/session/logout-button';
import { RequireSession } from '@/shared/session/require-session';

/**
 * Todas las pantallas de este grupo exigen sesión. Se dibujan en el navegador (decisión 3 de
 * H3): el token vive en memoria, así que el servidor no tiene con qué pedir datos.
 *
 * Se renderiza **en cada petición** (`connection`), no al construir: la navegación depende de los
 * feature flags, y la imagen publicada se construye una vez y los recibe al arrancar. Prerenderizada,
 * mostraría para siempre los flags que había en el build.
 */
export default async function PrivateLayout({ children }: Readonly<{ children: ReactNode }>) {
  await connection();

  return (
    // `RequireSession` lee la query para volver a ella después del login: sin `Suspense`, Next
    // no podría prerenderizar el resto de la página.
    <Suspense>
      <RequireSession>
        <UndoProvider>
          <Sidebar
            manifests={featureManifests}
            isEnabled={isFeatureEnabled}
            actions={<LogoutButton />}
          />
          {children}
        </UndoProvider>
      </RequireSession>
    </Suspense>
  );
}
