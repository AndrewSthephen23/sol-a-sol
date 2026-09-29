import { formatMoney } from '@/shared/format/money';

import type { CurrencyReport } from './dashboard-model';

const CURRENCY_NAMES = { PEN: 'soles', USD: 'dólares' } as const;

/** Ingresos, gastos, ahorro, deuda y saldo del mes en una moneda. El saldo negativo, en rojo y con signo. */
export function KpiCards({ report }: Readonly<{ report: CurrencyReport }>) {
  const { kpis, currency } = report;
  const negative = kpis.balance.startsWith('-');
  const cards = [
    { label: 'Ingresos', amount: kpis.income },
    { label: 'Gastos', amount: kpis.expense },
    { label: 'Ahorro e inversión', amount: kpis.saving },
    { label: 'Deuda', amount: kpis.debt },
  ];

  return (
    <dl
      aria-label={`Resumen en ${CURRENCY_NAMES[currency]}`}
      className="grid grid-cols-2 gap-2 sm:grid-cols-5"
    >
      {cards.map((card) => (
        <div key={card.label} className="rounded-lg border border-stone-200 bg-white p-3">
          <dt className="text-xs text-stone-500">{card.label}</dt>
          <dd className="font-semibold">{formatMoney(card.amount, currency)}</dd>
        </div>
      ))}
      <div
        className={`col-span-2 rounded-lg border p-3 sm:col-span-1 ${
          negative ? 'border-red-200 bg-red-50' : 'border-stone-200 bg-white'
        }`}
      >
        <dt className="text-xs text-stone-500">Saldo</dt>
        <dd className={`font-semibold ${negative ? 'text-red-700' : ''}`}>
          {formatMoney(kpis.balance, currency)}
        </dd>
      </div>
    </dl>
  );
}
