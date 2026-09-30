import { EditMovementScreen } from '@/features/transactions/movement-editor';
import { isFeatureEnabled } from '@/shared/navigation/feature-flags';
import { requireFeature } from '@/shared/navigation/require-feature';

type SearchParams = Record<string, string | string[] | undefined>;

function single(value: string | string[] | undefined): string | null {
  return typeof value === 'string' ? value : null;
}

/**
 * `?cuotas=6&total=…&cuotasError=CODE`: la compra se registró, pero sus cuotas no. Se vuelven a
 * ofrecer con lo que se había escrito y el motivo (ver `installmentsRetryUrl`).
 */
function installmentsRetry(search: SearchParams) {
  const count = single(search.cuotas);
  const code = single(search.cuotasError);
  if (count === null || code === null) return null;

  return {
    draft: { enabled: true, count, total: single(search.total) ?? '' },
    code: code === 'UNKNOWN' ? null : code,
  };
}

export default async function EditTransactionPage({
  params,
  searchParams,
}: Readonly<{ params: Promise<{ id: string }>; searchParams: Promise<SearchParams> }>) {
  await requireFeature('FEATURE_TRANSACTIONS');
  const { id } = await params;
  const cardsEnabled = isFeatureEnabled('FEATURE_CREDIT_CARDS');

  return (
    <EditMovementScreen
      kind="transaction"
      id={id}
      cardsEnabled={cardsEnabled}
      installmentsRetry={cardsEnabled ? installmentsRetry(await searchParams) : null}
    />
  );
}
