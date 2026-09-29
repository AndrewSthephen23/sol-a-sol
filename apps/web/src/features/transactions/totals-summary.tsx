import { formatMoney } from '@/shared/format/money';

import type { Totals } from './queries';

const ROWS = [
  { label: 'Ingresos', field: 'income' },
  { label: 'Gastos', field: 'expense' },
  { label: 'Ahorro e inversión', field: 'saving' },
  { label: 'Deuda', field: 'debt' },
] as const;

/**
 * Los totales de **todo** lo filtrado, no solo de la página cargada: los calcula la API. Una
 * tarjeta por moneda, sin convertir nunca.
 */
export function TotalsSummary({ totals }: Readonly<{ totals: readonly Totals[] }>) {
  if (totals.length === 0) return null;

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {totals.map((total) => (
        <dl
          key={total.currency}
          aria-label={`Totales en ${total.currency === 'PEN' ? 'soles' : 'dólares'}`}
          className="flex flex-col gap-1 rounded-lg border border-stone-200 bg-white p-4 text-sm"
        >
          {ROWS.map(({ label, field }) => (
            <div key={field} className="flex justify-between gap-4">
              <dt className="text-stone-500">{label}</dt>
              <dd className={`font-medium ${field === 'income' ? 'text-emerald-700' : ''}`}>
                {formatMoney(total[field], total.currency)}
              </dd>
            </div>
          ))}
          <div className="mt-1 flex justify-between gap-4 border-t border-stone-200 pt-2 font-semibold">
            <dt>Balance</dt>
            <dd className={total.balance.startsWith('-') ? 'text-red-700' : 'text-stone-900'}>
              {formatMoney(total.balance, total.currency)}
            </dd>
          </div>
        </dl>
      ))}
    </div>
  );
}
