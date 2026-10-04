import { InboxScreen } from '@/features/capture/inbox-screen';
import { requireFeature } from '@/shared/navigation/require-feature';

export default async function CapturePage() {
  await requireFeature('FEATURE_CAPTURE');

  return <InboxScreen />;
}
