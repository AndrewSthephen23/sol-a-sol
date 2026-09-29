'use client';

import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useMemo } from 'react';

import type { Clock } from '@sol-a-sol/domain';

import { currentMonth, formatMonth, readMonth, systemClock } from '@/shared/time/dates';
import { MonthNavigator } from '@/shared/time/month-navigator';
import { categoriesById } from '@/features/transactions/labels';
import { useCategories } from '@/features/transactions/queries';

import { DailyChart } from './daily-chart';
import { DistributionChart } from './distribution-chart';
import { KpiCards } from './kpi-cards';
import { useMonthlyReport } from './queries';
import { TypeTables } from './type-tables';

const NOTICE = 'rounded-lg border border-stone-200 bg-white p-6 text-center text-sm text-stone-600';
const CURRENCY_TITLES = { PEN: 'Soles', USD: 'Dólares' } as const;

/**
 * Cómo va el mes (sección 2.4 del plan), por moneda y sin convertir: KPIs, gasto diario, dona por
 * categoría y tablas por tipo. El mes vive en la URL, como en la lista y el presupuesto.
 */
export function DashboardScreen({ clock = systemClock }: Readonly<{ clock?: Clock }>) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const defaultMonth = useMemo(() => currentMonth(clock), [clock]);
  const month = readMonth(params.get('month'), defaultMonth);

  const report = useMonthlyReport(month);
  const categoryTree = useCategories();
  const categories = useMemo(() => categoriesById(categoryTree.data ?? []), [categoryTree.data]);

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-4 px-4 py-6">
      <h1 className="text-2xl font-bold tracking-tight">Resumen</h1>
      <MonthNavigator
        month={month}
        onChange={(next) => {
          router.push(next === defaultMonth ? pathname : `${pathname}?month=${next}`, {
            scroll: false,
          });
        }}
      />

      {report.isPending && <output className={NOTICE}>Cargando el resumen…</output>}

      {report.isError && (
        <div role="alert" className={NOTICE}>
          <p>No se pudo cargar el resumen.</p>
          <button
            type="button"
            onClick={() => void report.refetch()}
            className="mt-2 font-medium text-amber-700 underline"
          >
            Reintentar
          </button>
        </div>
      )}

      {report.isSuccess && report.data.currencies.length === 0 && (
        <div className={NOTICE}>
          <p>No hay movimientos en {formatMonth(month)}.</p>
          <Link
            href="/transactions/new"
            className="mt-2 inline-block font-medium text-amber-700 underline"
          >
            Registrar un movimiento
          </Link>
        </div>
      )}

      {report.data?.currencies.map((entry) => {
        const id = `dashboard-${entry.currency}`;

        return (
          <section key={entry.currency} aria-labelledby={id} className="flex flex-col gap-4">
            <h2 id={id} className="text-lg font-semibold">
              {CURRENCY_TITLES[entry.currency]}
            </h2>
            <KpiCards report={entry} />
            <div className="grid gap-4 lg:grid-cols-2">
              <div className="flex flex-col gap-2">
                <h3 className="text-sm font-semibold text-stone-500">Gasto por día</h3>
                <DailyChart daily={entry.daily} currency={entry.currency} />
              </div>
              <div className="flex flex-col gap-2">
                <h3 className="text-sm font-semibold text-stone-500">Gasto por categoría</h3>
                <DistributionChart
                  distribution={entry.distribution}
                  currency={entry.currency}
                  month={month}
                  categories={categories}
                />
              </div>
            </div>
            <TypeTables byType={entry.byType} currency={entry.currency} categories={categories} />
          </section>
        );
      })}
    </main>
  );
}
