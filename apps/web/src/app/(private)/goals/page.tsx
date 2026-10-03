import { GoalsScreen } from '@/features/goals/goals-screen';
import { requireFeature } from '@/shared/navigation/require-feature';

export default async function GoalsPage() {
  await requireFeature('FEATURE_GOALS');

  return <GoalsScreen />;
}
