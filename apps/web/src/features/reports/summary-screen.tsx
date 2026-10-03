'use client';

import type { Clock } from '@sol-a-sol/domain';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useMemo } from 'react';

import { currentMonth, formatMonth, readMonth, systemClock } from '@/shared/time/dates';
import { MonthNavigator } from '@/shared/time/month-navigator';
import { categoriesById } from '@/features/transactions/labels';
import { useCategories } from '@/features/transactions/queries';

import { useDownloadSummaryCsv, useMonthlySummary } from './queries';
import { BudgetSection, CardsSection, CurrencySection, GoalsSection } from './summary-sections';
import { ReportTabs } from './report-tabs';
import { previousLabel } from './summary-model';

const NOTICE = 'rounded-lg border border-stone-200 bg-white p-6 text-center text-sm text-stone-600';

/** Qué módulos están encendidos: lo lee la página en el servidor (decisión 18 de H6). */
export interface SummarySections {
  budget: boolean;
  cards: boolean;
  goals: boolean;
}

/**
 * El cierre de un mes (sección 2.7 del plan): cuánto entró, salió y se ahorró, cómo fue contra el
 * mes anterior, en qué se gastó más, el presupuesto, las tarjetas y las metas. Todo en texto y por
 * moneda; la API ya hizo las cuentas. El mes vive en la URL, como en el dashboard.
 *
 * Una sección de un módulo apagado no se dibuja: la página lo sabe en el servidor, y la API
 * tampoco la manda.
 */
export function SummaryScreen({
  clock = systemClock,
  sections,
}: Readonly<{ clock?: Clock; sections: SummarySections }>) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const defaultMonth = useMemo(() => currentMonth(clock), [clock]);
  // Un mes futuro no tiene resumen: si llega por la URL, se muestra el de hoy.
  const asked = readMonth(params.get('month'), defaultMonth);
  const month = asked > defaultMonth ? defaultMonth : asked;

  const summary = useMonthlySummary(month);
  const download = useDownloadSummaryCsv();
  const categoryTree = useCategories();
  const categories = useMemo(() => categoriesById(categoryTree.data ?? []), [categoryTree.data]);
  const categoryName = (id: string) => categories.get(id)?.name ?? 'Categoría';

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-4 py-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-bold tracking-tight">Resumen del mes</h1>
        <button
          type="button"
          disabled={!summary.isSuccess || download.isPending}
          onClick={() => {
            download.mutate(month);
          }}
          className="rounded-md border border-stone-300 bg-white px-3 py-2 text-sm font-medium hover:bg-stone-50 disabled:opacity-50"
        >
          {download.isPending ? 'Descargando…' : 'Descargar CSV'}
        </button>
      </div>
      <ReportTabs current="monthly" />
      {download.isError && (
        <p role="alert" className="text-sm text-red-700">
          No se pudo descargar el CSV. Inténtalo de nuevo.
        </p>
      )}
      <MonthNavigator
        month={month}
        max={defaultMonth}
        onChange={(next) => {
          router.push(next === defaultMonth ? pathname : `${pathname}?month=${next}`, {
            scroll: false,
          });
        }}
      />

      {summary.isPending && <output className={NOTICE}>Cargando el resumen…</output>}

      {summary.isError && (
        <div role="alert" className={NOTICE}>
          <p>No se pudo cargar el resumen de {formatMonth(month)}.</p>
          <button
            type="button"
            onClick={() => void summary.refetch()}
            className="mt-2 font-medium text-amber-700 underline"
          >
            Reintentar
          </button>
        </div>
      )}

      {summary.isSuccess && (
        <>
          {summary.data.currencies.length === 0 ? (
            <div className={NOTICE}>
              <p>No hay movimientos en {formatMonth(month)} ni en el mes anterior.</p>
              <Link
                href="/transactions/new"
                className="mt-2 inline-block font-medium text-amber-700 underline"
              >
                Registrar un movimiento
              </Link>
            </div>
          ) : (
            summary.data.currencies.map((entry) => (
              <CurrencySection
                key={entry.currency}
                entry={entry}
                against={previousLabel(summary.data)}
                categoryName={categoryName}
              />
            ))
          )}
          {sections.budget && summary.data.budget !== undefined && (
            <BudgetSection budget={summary.data.budget} month={month} categoryName={categoryName} />
          )}
          {sections.cards && summary.data.cards !== undefined && (
            <CardsSection summary={summary.data} />
          )}
          {sections.goals && summary.data.goals !== undefined && (
            <GoalsSection goals={summary.data.goals} />
          )}
        </>
      )}
    </main>
  );
}
