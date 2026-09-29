'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Pie, PieChart, ResponsiveContainer } from 'recharts';

import { type Currency, formatMoney } from '@/shared/format/money';
import type { CategoryInfo } from '@/features/transactions/labels';

import { ClientOnly } from './client-only';
import {
  categoryLink,
  chartNumber,
  type CurrencyReport,
  shareText,
  sliceColor,
  sliceName,
} from './dashboard-model';

interface DistributionChartProps {
  distribution: CurrencyReport['distribution'];
  currency: Currency;
  month: string;
  categories: ReadonlyMap<string, CategoryInfo>;
}

/**
 * La dona del gasto por categoría madre (decisión 9 de H4): las 6 mayores y «Otras». La leyenda
 * es la versión en texto, con cada categoría como enlace a sus movimientos del mes.
 */
export function DistributionChart({
  distribution,
  currency,
  month,
  categories,
}: Readonly<DistributionChartProps>) {
  const router = useRouter();

  if (distribution.length === 0) {
    return <p className="text-sm text-stone-600">Sin gastos este mes.</p>;
  }

  const data = distribution.map((slice) => ({
    categoryId: slice.categoryId,
    name: sliceName(slice, categories),
    value: chartNumber(slice.amount),
    // Recharts pinta cada porción con el `fill` de su dato: un atributo del SVG, no un estilo.
    fill: sliceColor(slice, categories),
  }));

  return (
    <div className="flex flex-col items-center gap-3 rounded-lg border border-stone-200 bg-white p-3">
      <div aria-hidden="true" className="size-48 shrink-0">
        <ClientOnly>
          <ResponsiveContainer width="100%" height="100%">
            <PieChart accessibilityLayer={false}>
              <Pie
                data={data}
                dataKey="value"
                nameKey="name"
                innerRadius="55%"
                outerRadius="95%"
                paddingAngle={1}
                isAnimationActive={false}
                onClick={(_sector, index) => {
                  const id = data[index]?.categoryId;
                  if (id) router.push(categoryLink(id, month));
                }}
                className="cursor-pointer"
              />
            </PieChart>
          </ResponsiveContainer>
        </ClientOnly>
      </div>
      <ol aria-label="Gasto por categoría" className="flex w-full min-w-0 flex-col gap-1 text-sm">
        {distribution.map((slice, index) => {
          const content = (
            <>
              {/* Un `<svg>` con `fill`, no un `style`: la CSP no permite estilos en línea. */}
              <svg aria-hidden="true" viewBox="0 0 10 10" className="size-3 shrink-0">
                <rect width="10" height="10" rx="2" fill={data[index]?.fill} />
              </svg>
              <span className="min-w-0 flex-1 truncate">{sliceName(slice, categories)}</span>
              <span className="whitespace-nowrap text-stone-500">{shareText(slice.share)}</span>
              <span className="text-right font-medium whitespace-nowrap">
                {formatMoney(slice.amount, currency)}
              </span>
            </>
          );

          return (
            <li key={slice.categoryId ?? 'others'}>
              {slice.categoryId === null ? (
                <span className="flex items-center gap-2 px-1 py-1.5">{content}</span>
              ) : (
                <Link
                  href={categoryLink(slice.categoryId, month)}
                  className="flex items-center gap-2 rounded px-1 py-1.5 hover:bg-stone-50"
                >
                  {content}
                </Link>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
