import { NewMovementScreen } from '@/features/transactions/movement-editor';
import { isFeatureEnabled } from '@/shared/navigation/feature-flags';
import { requireFeature } from '@/shared/navigation/require-feature';

export default async function NewMovementPage() {
  await requireFeature('FEATURE_TRANSACTIONS');

  return <NewMovementScreen cardsEnabled={isFeatureEnabled('FEATURE_CREDIT_CARDS')} />;
}
