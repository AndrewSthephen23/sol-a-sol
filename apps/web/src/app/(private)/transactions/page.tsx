import { notFound } from 'next/navigation';
import { connection } from 'next/server';
import { Suspense } from 'react';

import { TransactionsScreen } from '@/features/transactions/transactions-screen';
import { isFeatureEnabled } from '@/shared/navigation/feature-flags';

/**
 * Con el módulo apagado la pantalla no existe, igual que sus rutas en la API (404). El flag se lee
 * al recibir la petición, no al construir (ver el layout del grupo).
 */
export default async function TransactionsPage() {
  await connection();
  if (!isFeatureEnabled('FEATURE_TRANSACTIONS')) notFound();

  return (
    // Los filtros se leen de la query: sin `Suspense`, Next no podría prerenderizar el resto.
    <Suspense>
      <TransactionsScreen />
    </Suspense>
  );
}
