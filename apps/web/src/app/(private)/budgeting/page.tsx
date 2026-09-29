import { Suspense } from 'react';

import { BudgetScreen } from '@/features/budgeting/budget-screen';
import { requireFeature } from '@/shared/navigation/require-feature';

export default async function BudgetingPage() {
  await requireFeature('FEATURE_BUDGETING');

  return (
    // El mes se lee de la query: sin `Suspense`, Next no podría prerenderizar el resto.
    <Suspense>
      <BudgetScreen />
    </Suspense>
  );
}
