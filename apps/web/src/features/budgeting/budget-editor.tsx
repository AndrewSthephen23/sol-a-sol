'use client';

import { useMemo, useState } from 'react';

import { errorMessage, NETWORK_ERROR } from '@/shared/api/problem';
import type { Currency } from '@/shared/format/money';
import { Field, INPUT } from '@/features/transactions/field';
import { TRANSACTION_TYPES } from '@/features/transactions/filters';
import { type CategoryInfo, TYPE_LABELS } from '@/features/transactions/labels';

import {
  type BudgetLineBody,
  budgetErrorMessage,
  checkDraft,
  type DraftLine,
  draftKey,
} from './budget-model';
import type { SaveOutcome } from './queries';

const CURRENCY_SYMBOLS: Readonly<Record<Currency, string>> = { PEN: 'S/', USD: 'US$' };

interface BudgetEditorProps {
  initial: readonly DraftLine[];
  /** Todas las categorías de la cuenta, para nombrarlas y ofrecer las madres activas. */
  categories: ReadonlyMap<string, CategoryInfo>;
  save: (lines: BudgetLineBody[]) => Promise<SaveOutcome>;
  onDone: () => void;
}

/**
 * Armar el presupuesto del mes: una partida por categoría **madre** y moneda, cero o más. Se guarda
 * el mes entero de una vez (`PUT`), y el botón se desactiva mientras tanto.
 */
export function BudgetEditor({ initial, categories, save, onDone }: Readonly<BudgetEditorProps>) {
  const [draft, setDraft] = useState<DraftLine[]>([...initial]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [adding, setAdding] = useState({ categoryId: '', currency: 'PEN' as Currency });

  const nameOf = (id: string) => categories.get(id)?.name ?? 'Categoría';
  // Solo madres activas: la partida suma lo de sus hijas, y una archivada no recibe partidas nuevas.
  const offered = useMemo(
    () =>
      TRANSACTION_TYPES.map((type) => ({
        type,
        options: [...categories.values()].filter(
          (category) =>
            category.type === type && category.parentId === null && category.archivedAt === null,
        ),
      })).filter((group) => group.options.length > 0),
    [categories],
  );
  const taken = new Set(draft.map(draftKey));

  function add() {
    if (adding.categoryId === '') {
      setFormError('Elige una categoría para agregar.');

      return;
    }
    if (taken.has(draftKey(adding))) {
      setFormError('Esa categoría ya tiene partida en esa moneda.');

      return;
    }
    setFormError(null);
    setDraft((current) => [...current, { ...adding, amount: '' }]);
    setAdding((current) => ({ ...current, categoryId: '' }));
  }

  async function submit() {
    if (saving) return;
    const checked = checkDraft(draft);
    if ('errors' in checked) {
      setErrors(checked.errors);
      setFormError('Revisa los montos marcados.');

      return;
    }
    setErrors({});
    setFormError(null);
    setSaving(true);
    try {
      const outcome = await save(checked.lines);
      if (outcome.ok) {
        onDone();

        return;
      }
      setFormError(budgetErrorMessage(outcome.code) ?? errorMessage(outcome.code));
    } catch {
      setFormError(NETWORK_ERROR);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {draft.length === 0 && (
        <p className="text-sm text-stone-600">Agrega una partida para empezar.</p>
      )}
      <ul className="flex flex-col gap-3">
        {draft.map((line) => {
          const key = draftKey(line);

          return (
            <li key={key} className="flex items-end gap-2">
              <div className="flex-1">
                <Field
                  label={`${nameOf(line.categoryId)} (${CURRENCY_SYMBOLS[line.currency]})`}
                  error={errors[key]}
                >
                  {(control) => (
                    <input
                      {...control}
                      inputMode="decimal"
                      autoComplete="off"
                      placeholder="0.00"
                      value={line.amount}
                      onChange={(event) => {
                        const amount = event.target.value;
                        setDraft((current) =>
                          current.map((entry) =>
                            draftKey(entry) === key ? { ...entry, amount } : entry,
                          ),
                        );
                      }}
                      className={INPUT}
                    />
                  )}
                </Field>
              </div>
              <button
                type="button"
                aria-label={`Quitar ${nameOf(line.categoryId)} en ${CURRENCY_SYMBOLS[line.currency]}`}
                onClick={() => {
                  setDraft((current) => current.filter((entry) => draftKey(entry) !== key));
                }}
                className="mb-1 flex size-11 items-center justify-center rounded-md text-stone-400 hover:bg-red-50 hover:text-red-700"
              >
                ✕
              </button>
            </li>
          );
        })}
      </ul>

      <fieldset className="flex flex-col gap-2 rounded-lg border border-stone-200 bg-white p-3 text-sm">
        <legend className="px-1 font-medium">Agregar partida</legend>
        <div className="grid grid-cols-[1fr_auto] gap-2">
          <select
            aria-label="Categoría de la partida nueva"
            value={adding.categoryId}
            onChange={(event) => {
              setAdding((current) => ({ ...current, categoryId: event.target.value }));
            }}
            className={INPUT}
          >
            <option value="">Elige una categoría</option>
            {offered.map((group) => (
              <optgroup key={group.type} label={TYPE_LABELS[group.type]}>
                {group.options.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
          <select
            aria-label="Moneda de la partida nueva"
            value={adding.currency}
            onChange={(event) => {
              setAdding((current) => ({ ...current, currency: event.target.value as Currency }));
            }}
            className={INPUT}
          >
            <option value="PEN">S/</option>
            <option value="USD">US$</option>
          </select>
        </div>
        <button
          type="button"
          onClick={add}
          className="self-start font-medium text-amber-700 underline"
        >
          Agregar
        </button>
      </fieldset>

      {formError !== null && (
        <p role="alert" className="text-sm text-red-700">
          {formError}
        </p>
      )}

      <div className="flex gap-3">
        <button
          type="button"
          disabled={saving}
          onClick={() => void submit()}
          className="flex-1 rounded-md bg-amber-500 px-4 py-3 font-semibold text-white hover:bg-amber-600 disabled:opacity-50"
        >
          {saving ? 'Guardando…' : 'Guardar'}
        </button>
        <button
          type="button"
          disabled={saving}
          onClick={onDone}
          className="rounded-md border border-stone-300 px-4 py-3 font-medium hover:bg-stone-50"
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}
