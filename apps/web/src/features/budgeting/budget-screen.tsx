'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useMemo, useState } from 'react';

import type { Clock } from '@sol-a-sol/domain';

import { currentMonth, formatMonth, readMonth, systemClock } from '@/shared/time/dates';
import { MonthNavigator } from '@/shared/time/month-navigator';
import { categoriesById, type CategoryInfo } from '@/features/transactions/labels';
import { useCategories } from '@/features/transactions/queries';

import { BudgetEditor } from './budget-editor';
import { type CopiedBudgetResponse, draftFrom } from './budget-model';
import { BudgetView } from './budget-view';
import { useBudget, useCopyBudget, useSaveBudget } from './queries';

const NOTICE = 'rounded-lg border border-stone-200 bg-white p-6 text-center text-sm text-stone-600';

/** Qué pasó al copiar, en una frase: de qué mes y qué quedó fuera por estar archivado. */
export function copyNotice(
  copied: CopiedBudgetResponse,
  categories: ReadonlyMap<string, CategoryInfo>,
): string {
  if (copied.copiedFrom === null) return 'No hay un mes anterior con presupuesto para copiar.';
  const from = `${String(copied.copiedFrom.year)}-${String(copied.copiedFrom.month).padStart(2, '0')}`;
  const skipped = [
    ...new Set(
      copied.skipped.map((entry) => categories.get(entry.categoryId)?.name ?? 'Categoría'),
    ),
  ];

  return skipped.length === 0
    ? `Se copió de ${formatMonth(from)}.`
    : `Se copió de ${formatMonth(from)}. No se copiaron por estar archivadas: ${skipped.join(', ')}.`;
}

/**
 * El presupuesto de un mes: lo planeado contra lo real y, al editar, sus partidas. El mes vive en la
 * URL (`?month=2026-09`), así que el botón atrás vuelve al mes anterior que se miró.
 */
export function BudgetScreen({ clock = systemClock }: Readonly<{ clock?: Clock }>) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const defaultMonth = useMemo(() => currentMonth(clock), [clock]);
  const month = readMonth(params.get('month'), defaultMonth);

  const budget = useBudget(month);
  const save = useSaveBudget(month);
  const copy = useCopyBudget(month);
  const categoryTree = useCategories();
  const categories = useMemo(() => categoriesById(categoryTree.data ?? []), [categoryTree.data]);

  // Editar y el aviso de la copia son de un mes: al cambiar de mes se cierran.
  const [editing, setEditing] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ month: string; text: string } | null>(null);
  const [copyFailed, setCopyFailed] = useState(false);

  function goTo(next: string) {
    setCopyFailed(false);
    router.push(next === defaultMonth ? pathname : `${pathname}?month=${next}`, { scroll: false });
  }

  function copyPrevious() {
    setCopyFailed(false);
    copy.mutate(undefined, {
      onSuccess: (copied) => {
        setNotice({ month, text: copyNotice(copied, categories) });
      },
      onError: () => {
        setCopyFailed(true);
      },
    });
  }

  const isEditing = editing === month && budget.isSuccess;
  const hasLines = (budget.data?.lines.length ?? 0) > 0;

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-4 py-6">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-bold tracking-tight">Presupuesto</h1>
        {budget.isSuccess && !isEditing && (
          <button
            type="button"
            onClick={() => {
              setEditing(month);
            }}
            className="rounded-md bg-amber-500 px-4 py-2 font-semibold text-white hover:bg-amber-600"
          >
            {hasLines ? 'Editar' : 'Armar presupuesto'}
          </button>
        )}
      </div>

      {!isEditing && <MonthNavigator month={month} onChange={goTo} />}

      {budget.isPending && <output className={NOTICE}>Cargando presupuesto…</output>}

      {budget.isError && (
        <div role="alert" className={NOTICE}>
          <p>No se pudo cargar el presupuesto.</p>
          <button
            type="button"
            onClick={() => void budget.refetch()}
            className="mt-2 font-medium text-amber-700 underline"
          >
            Reintentar
          </button>
        </div>
      )}

      {notice?.month === month && (
        <output className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">{notice.text}</output>
      )}
      {copyFailed && (
        <p role="alert" className="text-sm text-red-700">
          No se pudo copiar. Inténtalo de nuevo.
        </p>
      )}

      {budget.isSuccess &&
        (isEditing ? (
          <>
            <h2 className="text-lg font-semibold">{formatMonth(month)}</h2>
            <BudgetEditor
              initial={draftFrom(budget.data)}
              categories={categories}
              save={(lines) => save.mutateAsync(lines)}
              onDone={() => {
                setEditing(null);
              }}
            />
          </>
        ) : (
          <>
            {hasLines || budget.data.summary.length > 0 ? (
              <BudgetView summary={budget.data.summary} categories={categories} />
            ) : (
              <p className={NOTICE}>No hay presupuesto para {formatMonth(month)}.</p>
            )}
            <button
              type="button"
              disabled={copy.isPending}
              onClick={copyPrevious}
              className="self-start rounded-md border border-stone-300 bg-white px-4 py-2 text-sm font-medium hover:bg-stone-50 disabled:opacity-50"
            >
              {copy.isPending ? 'Copiando…' : 'Copiar del mes anterior'}
            </button>
          </>
        ))}
    </main>
  );
}
