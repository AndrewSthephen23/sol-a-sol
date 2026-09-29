'use client';

import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

import { type Currency, formatMoney } from '@/shared/format/money';

import { ClientOnly } from './client-only';
import { chartNumber, type CurrencyReport, dailySummary } from './dashboard-model';

/**
 * Una barra por día con el gasto fijo + variable (decisión 8 de H4). El gráfico es decorativo
 * para un lector de pantalla: lo que dice va en el texto de abajo.
 */
export function DailyChart({
  daily,
  currency,
}: Readonly<{ daily: CurrencyReport['daily']; currency: Currency }>) {
  const data = daily.map((day) => ({
    day: String(Number(day.date.slice(8))),
    value: chartNumber(day.amount),
    label: formatMoney(day.amount, currency),
  }));

  return (
    <figure className="flex flex-col gap-2 rounded-lg border border-stone-200 bg-white p-3">
      <div aria-hidden="true" className="h-48 w-full">
        <ClientOnly>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} accessibilityLayer={false}>
              <XAxis dataKey="day" tickLine={false} fontSize={11} interval="preserveStartEnd" />
              <YAxis hide />
              <Tooltip
                cursor={{ fill: '#f5f5f4' }}
                separator=": "
                formatter={(_value, _name, item: { payload?: { label?: string } }) => [
                  item.payload?.label ?? '',
                  'Gasto',
                ]}
                labelFormatter={(day) => (typeof day === 'string' ? `Día ${day}` : '')}
              />
              <Bar dataKey="value" fill="#f59e0b" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ClientOnly>
      </div>
      <figcaption className="text-sm text-stone-600">{dailySummary(daily, currency)}</figcaption>
    </figure>
  );
}
