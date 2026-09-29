import { formatMoney } from '@/shared/format/money';
import { formatDay } from '@/shared/time/dates';

import { type CategoryInfo, paymentMethodLabel, signOf, TYPE_LABELS } from './labels';
import type { Movement, PaymentMethod } from './queries';

interface MovementListProps {
  movements: readonly Movement[];
  categories: ReadonlyMap<string, CategoryInfo>;
  paymentMethods: ReadonlyMap<string, PaymentMethod>;
  /** Tocar una etiqueta filtra por ella. */
  onTag: (tag: string) => void;
}

/** Los movimientos agrupados por día, en el orden en que llegan (del más reciente al más viejo). */
function byDay(movements: readonly Movement[]): [string, Movement[]][] {
  const days = new Map<string, Movement[]>();
  for (const movement of movements) {
    const day = days.get(movement.date);
    if (day) day.push(movement);
    else days.set(movement.date, [movement]);
  }

  return [...days];
}

export function MovementList({
  movements,
  categories,
  paymentMethods,
  onTag,
}: Readonly<MovementListProps>) {
  const methodName = (id: string | null) => {
    const method = id === null ? undefined : paymentMethods.get(id);

    return method === undefined ? null : paymentMethodLabel(method);
  };

  return (
    <div className="flex flex-col gap-6">
      {byDay(movements).map(([day, items]) => (
        <section key={day} aria-labelledby={`day-${day}`}>
          <h2
            id={`day-${day}`}
            className="mb-2 text-sm font-semibold text-stone-500 first-letter:uppercase"
          >
            {formatDay(day)}
          </h2>
          <ul className="divide-y divide-stone-100 rounded-lg border border-stone-200 bg-white">
            {items.map((movement) =>
              movement.kind === 'transfer' ? (
                <li key={movement.id} className="flex items-start justify-between gap-3 p-3">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{movement.description}</p>
                    <p className="text-sm text-stone-500">
                      Transferencia · {methodName(movement.fromPaymentMethodId) ?? '—'} →{' '}
                      {methodName(movement.toPaymentMethodId) ?? '—'}
                    </p>
                  </div>
                  <p className="shrink-0 text-right font-medium whitespace-nowrap text-stone-600">
                    {formatMoney(movement.amount, movement.currency)}
                    {movement.receivedCurrency !== movement.currency && (
                      <span className="block text-sm font-normal">
                        → {formatMoney(movement.receivedAmount, movement.receivedCurrency)}
                      </span>
                    )}
                  </p>
                </li>
              ) : (
                <li key={movement.id} className="flex items-start justify-between gap-3 p-3">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{movement.description}</p>
                    <p className="text-sm text-stone-500">
                      {[
                        categories.get(movement.categoryId)?.name ?? TYPE_LABELS[movement.type],
                        methodName(movement.paymentMethodId),
                        movement.merchant,
                      ]
                        .filter((part) => part !== null)
                        .join(' · ')}
                    </p>
                    {movement.tags.length > 0 && (
                      <ul aria-label="Etiquetas" className="mt-1 flex flex-wrap gap-1">
                        {movement.tags.map((tag) => (
                          <li key={tag}>
                            <button
                              type="button"
                              onClick={() => {
                                onTag(tag);
                              }}
                              className="rounded-full bg-amber-50 px-2 py-0.5 text-xs text-amber-800 hover:bg-amber-100"
                            >
                              #{tag}
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                  <p
                    className={`shrink-0 font-medium whitespace-nowrap ${
                      movement.type === 'INCOME' ? 'text-emerald-700' : 'text-stone-900'
                    }`}
                  >
                    {signOf(movement.type)}
                    {formatMoney(movement.amount, movement.currency)}
                  </p>
                </li>
              ),
            )}
          </ul>
        </section>
      ))}
    </div>
  );
}
