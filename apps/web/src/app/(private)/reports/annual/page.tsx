import { Suspense } from 'react';

import { AnnualScreen } from '@/features/reports/annual-screen';
import { requireFeature } from '@/shared/navigation/require-feature';

/** «Resumen» › «Anual» (decisión 18 de H6): el año mes a mes. */
export default async function AnnualReportPage() {
  await requireFeature('FEATURE_REPORTS');

  return (
    // El año se lee de la query: sin `Suspense`, Next no podría prerenderizar el resto.
    <Suspense>
      <AnnualScreen />
    </Suspense>
  );
}
