import { Suspense } from 'react';

import { DashboardScreen } from '@/features/dashboard/dashboard-screen';
import { isFeatureEnabled } from '@/shared/navigation/feature-flags';

/** La bienvenida mientras el dashboard está apagado: `/` siempre existe. */
function Welcome() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col justify-center gap-4 px-4 py-12">
      <h1 className="text-4xl font-bold tracking-tight">Sol a Sol</h1>
      <p className="text-lg text-stone-600">
        Ordena tus finanzas y avanza hacia la libertad financiera, sol a sol.
      </p>
    </main>
  );
}

/**
 * La pantalla inicial es el dashboard del mes (decisión 10 de H4), cuyos datos sirve `reports`.
 * Con su flag apagado queda la bienvenida, no un 404: `/` es a donde se llega al entrar. El layout
 * ya se dibuja en cada petición, así que el flag se lee al recibirla.
 */
export default function HomePage() {
  if (!isFeatureEnabled('FEATURE_REPORTS')) return <Welcome />;

  return (
    // El mes se lee de la query: sin `Suspense`, Next no podría prerenderizar el resto.
    <Suspense>
      <DashboardScreen
        showCardAlerts={isFeatureEnabled('FEATURE_CREDIT_CARDS')}
        showPendingCaptures={isFeatureEnabled('FEATURE_CAPTURE')}
      />
    </Suspense>
  );
}
