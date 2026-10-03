import { Suspense } from 'react';

import { SummaryScreen } from '@/features/reports/summary-screen';
import { isFeatureEnabled } from '@/shared/navigation/feature-flags';
import { requireFeature } from '@/shared/navigation/require-feature';

/**
 * «Resumen» (decisión 18 de H6): el cierre del mes. Las secciones de presupuesto, tarjetas y metas
 * dependen de sus flags, que se leen aquí, en el servidor: apagado, la sección no existe.
 */
export default async function ReportsPage() {
  await requireFeature('FEATURE_REPORTS');

  return (
    // El mes se lee de la query: sin `Suspense`, Next no podría prerenderizar el resto.
    <Suspense>
      <SummaryScreen
        sections={{
          budget: isFeatureEnabled('FEATURE_BUDGETING'),
          cards: isFeatureEnabled('FEATURE_CREDIT_CARDS'),
          goals: isFeatureEnabled('FEATURE_GOALS'),
        }}
      />
    </Suspense>
  );
}
