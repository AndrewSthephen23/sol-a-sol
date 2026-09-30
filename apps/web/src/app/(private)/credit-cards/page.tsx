import { CreditCardsScreen } from '@/features/credit-cards/credit-cards-screen';
import { requireFeature } from '@/shared/navigation/require-feature';

export default async function CreditCardsPage() {
  await requireFeature('FEATURE_CREDIT_CARDS');

  return <CreditCardsScreen />;
}
