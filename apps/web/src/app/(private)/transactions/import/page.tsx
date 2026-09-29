import { ImportScreen } from '@/features/transactions/import-screen';
import { requireFeature } from '@/shared/navigation/require-feature';

export default async function ImportPage() {
  await requireFeature('FEATURE_TRANSACTIONS');

  return <ImportScreen />;
}
