'use client';

import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useMemo, useState } from 'react';

import type { Clock } from '@sol-a-sol/domain';

import { currentMonth, formatMonth, systemClock } from '@/shared/time/dates';

import { FilterBar } from './filter-bar';
import { type Filters, readFilters, writeFilters } from './filters';
import { categoriesById } from './labels';
import { useDeleteWithUndo } from './movement-editor';
import { MovementList } from './movement-list';
import { useCategories, useMovements, usePaymentMethods, useTags } from './queries';
import { TotalsSummary } from './totals-summary';

const NOTICE = 'rounded-lg border border-stone-200 bg-white p-6 text-center text-sm text-stone-600';

/**
 * Los movimientos de un mes: filtros, totales y la lista por día. Los filtros viven en la URL,
 * así que filtrar no recarga la página y el botón atrás deshace un filtro.
 */
export function TransactionsScreen({ clock = systemClock }: Readonly<{ clock?: Clock }>) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const defaultMonth = useMemo(() => currentMonth(clock), [clock]);
  const filters = useMemo(() => readFilters(params, defaultMonth), [params, defaultMonth]);

  const setFilters = useCallback(
    (next: Filters) => {
      const query = writeFilters(next, defaultMonth);
      // Escribir en la búsqueda no deja una entrada de historial por cada letra.
      const url = query === '' ? pathname : `${pathname}?${query}`;
      if (next.q === filters.q) router.push(url, { scroll: false });
      else router.replace(url, { scroll: false });
    },
    [router, pathname, defaultMonth, filters.q],
  );

  const movements = useMovements(filters);
  const categoryTree = useCategories();
  const paymentMethods = usePaymentMethods();
  const tags = useTags();
  const deleteWithUndo = useDeleteWithUndo();
  const [deleteFailed, setDeleteFailed] = useState(false);

  const categories = useMemo(() => categoriesById(categoryTree.data ?? []), [categoryTree.data]);
  const methods = useMemo(
    () => new Map((paymentMethods.data ?? []).map((method) => [method.id, method])),
    [paymentMethods.data],
  );
  const items = movements.data?.pages.flatMap((page) => page.items) ?? [];
  const totals = movements.data?.pages[0]?.totals ?? [];
  const filtered =
    filters.show !== 'ALL' ||
    filters.categoryId !== null ||
    filters.tag !== null ||
    filters.q !== null;

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-4 py-6">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-bold tracking-tight">Transacciones</h1>
        <Link href="/transactions/import" className="ml-auto text-sm text-stone-600 underline">
          Importar CSV
        </Link>
        {/* En el teléfono queda fijo abajo, al alcance del pulgar. */}
        <Link
          href="/transactions/new"
          className="fixed right-4 bottom-4 z-10 rounded-full bg-amber-500 px-5 py-3 font-semibold text-white shadow-lg hover:bg-amber-600 sm:static sm:rounded-md sm:px-4 sm:py-2 sm:shadow-none"
        >
          + Registrar
        </Link>
      </div>

      <FilterBar
        filters={filters}
        categories={[...categories.values()]}
        tags={tags.data ?? []}
        onChange={setFilters}
      />

      {movements.isPending && <output className={NOTICE}>Cargando movimientos…</output>}

      {movements.isError && (
        <div role="alert" className={NOTICE}>
          <p>No se pudieron cargar los movimientos.</p>
          <button
            type="button"
            onClick={() => void movements.refetch()}
            className="mt-2 font-medium text-amber-700 underline"
          >
            Reintentar
          </button>
        </div>
      )}

      {deleteFailed && (
        <p role="alert" className="text-sm text-red-700">
          No se pudo borrar. Inténtalo de nuevo.
        </p>
      )}

      {movements.isSuccess && (
        <>
          <TotalsSummary totals={totals} />
          {items.length === 0 ? (
            <p className={NOTICE}>
              {filtered
                ? 'Ningún movimiento coincide con estos filtros.'
                : `No hay movimientos en ${formatMonth(filters.month)}.`}
            </p>
          ) : (
            <MovementList
              movements={items}
              categories={categories}
              paymentMethods={methods}
              onTag={(tag) => {
                setFilters({ ...filters, tag });
              }}
              onDelete={(kind, id) => {
                setDeleteFailed(false);
                void deleteWithUndo(kind, id).then((deleted) => {
                  setDeleteFailed(!deleted);
                });
              }}
            />
          )}
          {movements.hasNextPage && (
            <button
              type="button"
              disabled={movements.isFetchingNextPage}
              onClick={() => void movements.fetchNextPage()}
              className="self-center rounded-md border border-stone-300 bg-white px-4 py-2 font-medium hover:bg-stone-50 disabled:opacity-50"
            >
              {movements.isFetchingNextPage ? 'Cargando…' : 'Cargar más'}
            </button>
          )}
        </>
      )}
    </main>
  );
}
