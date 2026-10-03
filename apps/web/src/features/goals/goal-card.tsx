'use client';

import { useState } from 'react';

import { ContributionForm } from './contribution-form';
import { ContributionList } from './contribution-list';
import { GoalForm } from './goal-form';
import {
  type Goal,
  goalDraftFor,
  goalPatchOf,
  periodText,
  progressBar,
  remainingText,
  savedText,
  statusText,
  suggestedText,
} from './goal-model';
import { useSaveGoal } from './queries';

const BUTTON =
  'rounded-md border border-stone-300 bg-white px-3 py-2 text-sm font-medium hover:bg-stone-50';
const STATUS_COLOR = {
  ON_TRACK: 'text-stone-700',
  AT_RISK: 'text-red-700',
  ACHIEVED: 'text-green-700',
  OVERDUE: 'text-red-700',
} as const;

/**
 * Una meta de un vistazo: cuánto va, cuánto falta, cuánto aportar al mes y cómo va, **en texto**.
 * La barra es `<progress>`: nativa, accesible y sin estilos en línea (la CSP los bloquea).
 */
export function GoalCard({ goal, today }: Readonly<{ goal: Goal; today: string }>) {
  const [mode, setMode] = useState<'view' | 'edit' | 'contribute'>('view');
  const [showContributions, setShowContributions] = useState(false);
  const save = useSaveGoal();
  const title = `goal-${goal.id}`;
  const suggested = suggestedText(goal);
  const close = () => {
    setMode('view');
  };

  return (
    <article
      aria-labelledby={title}
      className="flex flex-col gap-3 rounded-lg border border-stone-200 bg-white p-4"
    >
      <div className="flex items-baseline justify-between gap-2">
        <h2 id={title} className="font-semibold">
          {goal.name}
          {goal.archived && (
            <span className="ml-2 text-sm font-normal text-stone-500">(archivada)</span>
          )}
        </h2>
        <p className="text-xs text-stone-500">{periodText(goal)}</p>
      </div>

      {mode === 'edit' ? (
        <GoalForm
          initial={goalDraftFor(goal, today)}
          creating={false}
          save={(body) => save.mutateAsync({ goalId: goal.id, patch: goalPatchOf(body) })}
          onDone={close}
        />
      ) : (
        <>
          <p className="text-sm">{savedText(goal)}</p>
          <progress
            max={100}
            value={progressBar(goal.progress.percentage)}
            aria-label={`${goal.name}: ${savedText(goal)}`}
            className={`h-2 w-full overflow-hidden rounded-full [&::-moz-progress-bar]:rounded-full [&::-webkit-progress-bar]:bg-stone-100 [&::-webkit-progress-value]:rounded-full ${
              goal.progress.status === 'ACHIEVED'
                ? '[&::-moz-progress-bar]:bg-green-600 [&::-webkit-progress-value]:bg-green-600'
                : '[&::-moz-progress-bar]:bg-amber-500 [&::-webkit-progress-value]:bg-amber-500'
            }`}
          />
          <p className="text-sm text-stone-600">{remainingText(goal)}</p>
          <p className={`text-sm font-medium ${STATUS_COLOR[goal.progress.status]}`}>
            {statusText(goal)}
          </p>
          {suggested !== null && <p className="text-sm text-stone-600">{suggested}</p>}
        </>
      )}

      {mode === 'contribute' && <ContributionForm goal={goal} today={today} onDone={close} />}

      {mode === 'view' && (
        <div className="flex flex-wrap gap-2">
          {!goal.archived && (
            <button
              type="button"
              onClick={() => {
                setMode('contribute');
              }}
              className="rounded-md bg-amber-500 px-3 py-2 text-sm font-semibold text-white hover:bg-amber-600"
            >
              Aportar
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              setMode('edit');
            }}
            className={BUTTON}
          >
            Corregir
          </button>
          <button
            type="button"
            aria-expanded={showContributions}
            onClick={() => {
              setShowContributions((shown) => !shown);
            }}
            className={BUTTON}
          >
            {showContributions ? 'Ocultar aportes' : 'Ver aportes'}
          </button>
          <button
            type="button"
            disabled={save.isPending}
            onClick={() => {
              void save.mutateAsync({ goalId: goal.id, patch: { archived: !goal.archived } });
            }}
            className={BUTTON}
          >
            {goal.archived ? 'Desarchivar' : 'Archivar'}
          </button>
        </div>
      )}

      {showContributions && <ContributionList goal={goal} />}
    </article>
  );
}
