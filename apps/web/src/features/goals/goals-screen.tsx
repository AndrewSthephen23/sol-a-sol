'use client';

import type { Clock } from '@sol-a-sol/domain';
import { useMemo, useState } from 'react';

import { systemClock, todayIn } from '@/shared/time/dates';

import { GoalCard } from './goal-card';
import { GoalForm } from './goal-form';
import { goalDraftFor } from './goal-model';
import { useGoals, useSaveGoal } from './queries';

const NOTICE = 'rounded-lg border border-stone-200 bg-white p-6 text-center text-sm text-stone-600';

/**
 * Las metas de ahorro (decisión 18 de H6): crear una, aportarle y ver cómo va cada una. Las
 * archivadas se ven con «Ver archivadas».
 */
export function GoalsScreen({ clock = systemClock }: Readonly<{ clock?: Clock }>) {
  const [includeArchived, setIncludeArchived] = useState(false);
  const [creating, setCreating] = useState(false);
  const goals = useGoals(includeArchived);
  const save = useSaveGoal();
  const today = useMemo(() => todayIn(clock), [clock]);

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-4 py-6">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-2xl font-bold tracking-tight">Metas</h1>
        {!creating && (
          <button
            type="button"
            onClick={() => {
              setCreating(true);
            }}
            className="rounded-md bg-amber-500 px-3 py-2 text-sm font-semibold text-white hover:bg-amber-600"
          >
            Nueva meta
          </button>
        )}
      </div>

      {creating && (
        <section
          aria-label="Nueva meta"
          className="rounded-lg border border-stone-200 bg-white p-4"
        >
          <GoalForm
            initial={goalDraftFor(null, today)}
            creating
            save={(body) => save.mutateAsync({ body })}
            onDone={() => {
              setCreating(false);
            }}
          />
        </section>
      )}

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={includeArchived}
          onChange={(event) => {
            setIncludeArchived(event.target.checked);
          }}
        />
        Ver archivadas
      </label>

      {goals.isPending && <output className={NOTICE}>Cargando tus metas…</output>}

      {goals.isError && (
        <div role="alert" className={NOTICE}>
          <p>No se pudieron cargar tus metas.</p>
          <button
            type="button"
            onClick={() => void goals.refetch()}
            className="mt-2 font-medium text-amber-700 underline"
          >
            Reintentar
          </button>
        </div>
      )}

      {goals.isSuccess && goals.data.length === 0 && (
        <p className={NOTICE}>
          Todavía no tienes metas. Crea una para saber cuánto aportar cada mes y si vas a llegar.
        </p>
      )}

      {goals.isSuccess &&
        goals.data.map((goal) => <GoalCard key={goal.id} goal={goal} today={today} />)}
    </main>
  );
}
