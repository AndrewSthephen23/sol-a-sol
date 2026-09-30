import { Suspense } from 'react';

import { TransactionsScreen } from '@/features/transactions/transactions-screen';
import { isFeatureEnabled } from '@/shared/navigation/feature-flags';
import { requireFeature } from '@/shared/navigation/require-feature';

export default async function TransactionsPage() {
  await requireFeature('FEATURE_TRANSACTIONS');

  return (
    // Los filtros se leen de la query: sin `Suspense`, Next no podría prerenderizar el resto.
    <Suspense>
      <TransactionsScreen cardsEnabled={isFeatureEnabled('FEATURE_CREDIT_CARDS')} />
    </Suspense>
  );
}
