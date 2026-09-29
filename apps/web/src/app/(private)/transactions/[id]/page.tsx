import { EditMovementScreen } from '@/features/transactions/movement-editor';
import { requireFeature } from '@/shared/navigation/require-feature';

export default async function EditTransactionPage({
  params,
}: Readonly<{ params: Promise<{ id: string }> }>) {
  await requireFeature('FEATURE_TRANSACTIONS');
  const { id } = await params;

  return <EditMovementScreen kind="transaction" id={id} />;
}
