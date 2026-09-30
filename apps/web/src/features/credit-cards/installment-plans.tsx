'use client';

import { useState } from 'react';

import { formatMoney } from '@/shared/format/money';

import { planLines } from './installment-model';
import { useDeleteInstallmentPlan, useInstallmentPlans } from './queries';

/**
 * Las compras en cuotas de una tarjeta: cuántas se facturaron, la próxima y en qué estado va, y lo
 * que falta. Deshacer vuelve a cobrar la compra entera en su estado de cuenta.
 */
export function InstallmentPlans({ cardId }: Readonly<{ cardId: string }>) {
  const plans = useInstallmentPlans(cardId);
  const remove = useDeleteInstallmentPlan();
  const [failed, setFailed] = useState(false);

  if (plans.isError) {
    return <p className="text-sm text-stone-600">No se pudieron cargar las compras en cuotas.</p>;
  }
  if (plans.data === undefined || plans.data.length === 0) return null;

  return (
    <section aria-label="Compras en cuotas" className="flex flex-col gap-2 text-sm">
      <h3 className="font-medium">Compras en cuotas</h3>
      <ul className="flex flex-col gap-2">
        {plans.data.map((plan) => {
          const title = plan.purchase?.description ?? 'Compra borrada';

          return (
            <li key={plan.id} className="rounded-md border border-stone-200 p-3">
              <p className="font-medium">
                {title}
                {plan.total !== null &&
                  ` · ${String(plan.count)} cuotas de ${formatMoney(plan.total.amount, plan.total.currency)} en total`}
              </p>
              <ul className="text-stone-600">
                {planLines(plan).map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
              <button
                type="button"
                disabled={remove.isPending}
                onClick={() => {
                  setFailed(false);
                  remove.mutate(
                    { cardId, planId: plan.id },
                    {
                      onSuccess: (ok) => {
                        setFailed(!ok);
                      },
                      onError: () => {
                        setFailed(true);
                      },
                    },
                  );
                }}
                aria-label={`Deshacer las cuotas de «${title}»`}
                className="mt-2 font-medium text-amber-700 underline disabled:opacity-50"
              >
                Deshacer cuotas
              </button>
            </li>
          );
        })}
      </ul>
      {failed && (
        <p role="alert" className="text-red-700">
          No se pudieron deshacer las cuotas. Inténtalo de nuevo.
        </p>
      )}
    </section>
  );
}
