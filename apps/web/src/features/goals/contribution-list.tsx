'use client';

import { useState } from 'react';

import { useUndoNotice } from '@/shared/feedback/undo-toast';

import {
  contributionBodyOf,
  contributionStateText,
  contributionText,
  type Goal,
  removeErrorText,
} from './goal-model';
import { useAddContribution, useGoalContributions, useRemoveContribution } from './queries';

/**
 * Los aportes y retiros de una meta, como están hoy, con «Quitar». Quitar se deshace al momento
 * con el aviso de «Deshacer», que vuelve a registrar el mismo aporte.
 */
export function ContributionList({ goal }: Readonly<{ goal: Goal }>) {
  const contributions = useGoalContributions(goal.id, true);
  const remove = useRemoveContribution();
  const add = useAddContribution();
  const notify = useUndoNotice();
  const [error, setError] = useState<string | null>(null);

  if (contributions.isPending) return <p className="text-sm text-stone-600">Cargando aportes…</p>;
  if (contributions.isError) {
    return (
      <p role="alert" className="text-sm text-red-700">
        No se pudieron cargar los aportes.
      </p>
    );
  }
  if (contributions.data.length === 0) {
    return <p className="text-sm text-stone-600">Todavía no hay aportes.</p>;
  }

  return (
    <div className="flex flex-col gap-2">
      {error !== null && (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}
      <ul className="divide-y divide-stone-100 rounded-md border border-stone-200">
        {contributions.data.map((contribution) => {
          const text = contributionText(contribution, goal.currency);
          const state = contributionStateText(contribution);

          return (
            <li key={contribution.id} className="flex items-center justify-between gap-2 p-2">
              <div className="text-sm">
                <p>{text}</p>
                {state !== null && <p className="text-amber-700">{state}</p>}
              </div>
              <button
                type="button"
                aria-label={`Quitar: ${text}`}
                onClick={() => {
                  setError(null);
                  void remove
                    .mutateAsync({ goalId: goal.id, contributionId: contribution.id })
                    .then((outcome) => {
                      if (!outcome.ok) {
                        setError(removeErrorText(outcome.code));

                        return;
                      }
                      const again = contributionBodyOf(contribution);
                      if (again === null) return;
                      notify({
                        message: 'Aporte quitado.',
                        undo: async () =>
                          (await add.mutateAsync({ goalId: goal.id, body: again })).ok,
                      });
                    });
                }}
                className="rounded-md px-2 py-1 text-sm text-stone-600 hover:bg-red-50 hover:text-red-700"
              >
                Quitar
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
