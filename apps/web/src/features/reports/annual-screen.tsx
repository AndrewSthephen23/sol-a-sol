'use client';

import type { Clock } from '@sol-a-sol/domain';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useMemo } from 'react';

import { currentMonth, systemClock } from '@/shared/time/dates';
import { PeriodNavigator } from '@/shared/time/month-navigator';
import { DistributionChart } from '@/features/dashboard/distribution-chart';
import { categoriesById } from '@/features/transactions/labels';
import { useCategories } from '@/features/transactions/queries';

import { AnnualChart } from './annual-chart';
import { annualSavingsText, FIRST_YEAR, readYear } from './annual-model';
import { AnnualTable } from './annual-table';
import { useAnnualSummary } from './queries';
import { ReportTabs } from './report-tabs';

const NOTICE = 'rounded-lg border border-stone-200 bg-white p-6 text-center text-sm text-stone-600';
const CURRENCY_TITLES = { PEN: 'Soles', USD: 'Dólares' } as const;
const CURRENCY_NAMES = { PEN: 'soles', USD: 'dólares' } as const;

/**
 * El año mes a mes (sección 2.8 del plan): las barras de ingresos, gastos, ahorro e inversión, la
 * tabla con cada fila y su total (la versión en texto de las barras), la tasa de ahorro del año y
 * la dona del gasto. Por moneda, sin convertir; la API ya hizo las cuentas. El año vive en la URL.
 */
export function AnnualScreen({ clock = systemClock }: Readonly<{ clock?: Clock }>) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const currentYear = useMemo(() => Number(currentMonth(clock).slice(0, 4)), [clock]);
  const year = readYear(params.get('year'), currentYear);

  const summary = useAnnualSummary(year);
  const categoryTree = useCategories();
  const categories = useMemo(() => categoriesById(categoryTree.data ?? []), [categoryTree.data]);

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-4 px-4 py-6">
      <h1 className="text-2xl font-bold tracking-tight">Resumen del año</h1>
      <ReportTabs current="annual" />
      <PeriodNavigator
        label={String(year)}
        unit="Año"
        canGoBack={year > FIRST_YEAR}
        canGoForward={year < currentYear}
        onStep={(delta) => {
          const next = year + delta;
          router.push(next === currentYear ? pathname : `${pathname}?year=${String(next)}`, {
            scroll: false,
          });
        }}
      />

      {summary.isPending && <output className={NOTICE}>Cargando el resumen del año…</output>}

      {summary.isError && (
        <div role="alert" className={NOTICE}>
          <p>No se pudo cargar el resumen de {year}.</p>
          <button
            type="button"
            onClick={() => void summary.refetch()}
            className="mt-2 font-medium text-amber-700 underline"
          >
            Reintentar
          </button>
        </div>
      )}

      {summary.isSuccess && summary.data.currencies.length === 0 && (
        <p className={NOTICE}>No hay movimientos en {year}.</p>
      )}

      {summary.data?.currencies.map((entry) => {
        const id = `annual-${entry.currency}`;

        return (
          <section key={entry.currency} aria-labelledby={id} className="flex flex-col gap-3">
            <h2 id={id} className="text-lg font-semibold">
              {CURRENCY_TITLES[entry.currency]}
            </h2>
            <p className="text-sm font-medium">{annualSavingsText(year, entry.savingsRate)}</p>
            <AnnualChart entry={entry} />
            <AnnualTable
              entry={entry}
              caption={`${String(year)} mes a mes, en ${CURRENCY_NAMES[entry.currency]}`}
            />
            <div className="flex flex-col gap-2">
              <h3 className="text-sm font-semibold text-stone-500">Gasto del año por categoría</h3>
              <DistributionChart
                distribution={entry.distribution}
                currency={entry.currency}
                categories={categories}
                emptyText="Sin gastos este año."
              />
            </div>
          </section>
        );
      })}
    </main>
  );
}
