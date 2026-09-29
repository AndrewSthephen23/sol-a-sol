import { Suspense } from 'react';

import { TransactionsScreen } from '@/features/transactions/transactions-screen';
import { requireFeature } from '@/shared/navigation/require-feature';

export default async function TransactionsPage() {
  await requireFeature('FEATURE_TRANSACTIONS');

  return (
    // Los filtros se leen de la query: sin `Suspense`, Next no podría prerenderizar el resto.
    <Suspense>
      <TransactionsScreen />
    </Suspense>
  );
}
