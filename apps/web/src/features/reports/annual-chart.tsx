'use client';

import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

import { ClientOnly } from '@/features/dashboard/client-only';

import { type AnnualCurrency, BAR_SERIES, barData } from './annual-model';

/**
 * Ingresos, gastos, ahorro e inversión de cada mes, en barras. Decorativo para un lector de
 * pantalla: lo que dice está en la tabla. Se dibuja solo en el navegador (`ClientOnly`): Recharts
 * pone estilos en línea que la CSP bloquearía en el HTML del servidor.
 */
export function AnnualChart({ entry }: Readonly<{ entry: AnnualCurrency }>) {
  const data = barData(entry);

  return (
    <div aria-hidden="true" className="h-56 w-full rounded-lg border border-stone-200 bg-white p-2">
      <ClientOnly>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} accessibilityLayer={false}>
            <XAxis dataKey="month" tickLine={false} fontSize={11} interval={0} />
            <YAxis hide />
            <Tooltip
              cursor={{ fill: '#f5f5f4' }}
              separator=": "
              formatter={(_value, name, item: { payload?: Record<string, unknown> }) => {
                const series = BAR_SERIES.find((entry_) => entry_.row === name);
                const label = item.payload?.[`${String(name)}_label`];

                return [typeof label === 'string' ? label : '', series?.label ?? ''];
              }}
            />
            {BAR_SERIES.map((series) => (
              // El color va como atributo `fill` del SVG, no como estilo.
              <Bar key={series.row} dataKey={series.row} fill={series.fill} radius={[2, 2, 0, 0]} />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </ClientOnly>
    </div>
  );
}
