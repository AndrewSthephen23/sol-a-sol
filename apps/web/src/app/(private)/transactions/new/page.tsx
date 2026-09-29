import { NewMovementScreen } from '@/features/transactions/movement-editor';
import { requireFeature } from '@/shared/navigation/require-feature';

export default async function NewMovementPage() {
  await requireFeature('FEATURE_TRANSACTIONS');

  return <NewMovementScreen />;
}
