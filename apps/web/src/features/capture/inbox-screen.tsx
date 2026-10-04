'use client';

import type { Clock } from '@sol-a-sol/domain';
import { useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';

import { systemClock, todayIn } from '@/shared/time/dates';

import { useCategories, usePaymentMethods } from '@/features/transactions/queries';

import { CaptureCard } from './capture-card';
import { missingToConfirm } from './capture-model';
import {
  capturesKey,
  type InboxStatus,
  useCaptures,
  useConfirmCaptures,
  useRules,
} from './queries';
import { RulesPanel } from './rules-panel';

const NOTICE = 'rounded-lg border border-stone-200 bg-white p-6 text-center text-sm text-stone-600';

type Tab = InboxStatus | 'rules';

/** Las reglas viven en una pestaña de la bandeja, no en el menú (decidido el 2026-10-04). */
const TABS: readonly { tab: Tab; label: string }[] = [
  { tab: 'inbox', label: 'Por revisar' },
  { tab: 'discarded', label: 'Descartadas' },
  { tab: 'rules', label: 'Reglas' },
];

/**
 * La bandeja (decisiones 9 a 14): lo que mandó el teléfono, primero lo más reciente, para
 * confirmarlo, corregirlo o descartarlo en segundos. Las descartadas, en su pestaña, se pueden
 * restaurar hasta que se borran a los 90 días; las reglas de categorización, en la suya.
 */
export function InboxScreen({ clock = systemClock }: Readonly<{ clock?: Clock }>) {
  const [tab, setTab] = useState<Tab>('inbox');
  const [highlighted, setHighlighted] = useState<string | null>(null);
  const [bulkNotice, setBulkNotice] = useState<string | null>(null);
  const status: InboxStatus = tab === 'rules' ? 'inbox' : tab;
  const captures = useCaptures(status);
  const categories = useCategories();
  const paymentMethods = usePaymentMethods();
  const rules = useRules();
  const confirmMany = useConfirmCaptures();
  const today = useMemo(() => todayIn(clock), [clock]);
  const client = useQueryClient();

  const items = captures.data?.pages.flatMap((page) => page.items) ?? [];
  const complete =
    tab === 'inbox' ? items.filter((item) => missingToConfirm(item).length === 0) : [];
  const ready = categories.isSuccess && paymentMethods.isSuccess && rules.isSuccess;
  const failed = captures.isError || categories.isError || paymentMethods.isError || rules.isError;

  async function confirmComplete() {
    setBulkNotice(null);
    const result = await confirmMany.mutateAsync(complete.map(({ id }) => id)).catch(() => null);
    if (result === null) setBulkNotice('No se pudieron confirmar. Inténtalo de nuevo.');
    else if (result.failed > 0) {
      setBulkNotice(
        `${String(result.failed)} no se ${result.failed === 1 ? 'pudo' : 'pudieron'} confirmar: revísalas.`,
      );
    }
  }

  function retry() {
    void captures.refetch();
    void categories.refetch();
    void paymentMethods.refetch();
    void rules.refetch();
  }

  function captureList() {
    return (
      <>
        {complete.length > 1 && (
          <button
            type="button"
            disabled={confirmMany.isPending}
            onClick={() => void confirmComplete()}
            className="self-start rounded-md bg-amber-500 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-600 disabled:opacity-50"
          >
            Confirmar las {complete.length} completas
          </button>
        )}
        {bulkNotice !== null && (
          <p role="alert" className="text-sm text-red-700">
            {bulkNotice}
          </p>
        )}
        {captures.isSuccess && items.length === 0 && (
          <p className={NOTICE}>
            {status === 'inbox' ? 'No hay nada por revisar.' : 'No hay capturas descartadas.'}
          </p>
        )}
        {ready &&
          items.map((capture) => (
            <CaptureCard
              key={capture.id}
              capture={capture}
              categories={categories.data}
              paymentMethods={paymentMethods.data}
              rules={rules.data}
              today={today}
              onShowRule={(ruleId) => {
                setTab('rules');
                setHighlighted(ruleId);
              }}
            />
          ))}
        {captures.hasNextPage && (
          <button
            type="button"
            disabled={captures.isFetchingNextPage}
            onClick={() => void captures.fetchNextPage()}
            className="self-center text-sm font-medium text-amber-700 underline"
          >
            Ver más
          </button>
        )}
      </>
    );
  }

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-4 py-6">
      <h1 className="text-2xl font-bold tracking-tight">Bandeja</h1>

      <div role="tablist" aria-label="Qué ver" className="flex flex-wrap gap-2">
        {TABS.map((option) => (
          <button
            key={option.tab}
            type="button"
            role="tab"
            aria-selected={tab === option.tab}
            onClick={() => {
              setTab(option.tab);
              setHighlighted(null);
              setBulkNotice(null);
              // Llegan capturas mientras se mira: cambiar de pestaña las vuelve a pedir.
              void client.invalidateQueries({ queryKey: capturesKey });
            }}
            className="rounded-full border border-stone-300 px-3 py-1 text-sm aria-selected:border-amber-500 aria-selected:bg-amber-50 aria-selected:font-semibold"
          >
            {option.label}
          </button>
        ))}
      </div>

      {(captures.isPending || (captures.isSuccess && !ready && !failed)) && (
        <output className={NOTICE}>Cargando la bandeja…</output>
      )}

      {failed && (
        <div role="alert" className={NOTICE}>
          <p>No se pudo cargar la bandeja.</p>
          <button
            type="button"
            onClick={retry}
            className="mt-2 font-medium text-amber-700 underline"
          >
            Reintentar
          </button>
        </div>
      )}

      {tab === 'rules'
        ? ready && (
            <RulesPanel rules={rules.data} categories={categories.data} highlighted={highlighted} />
          )
        : captureList()}
    </main>
  );
}
