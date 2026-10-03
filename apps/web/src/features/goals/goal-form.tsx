'use client';

import { CURRENCY_SYMBOLS } from '@/features/credit-cards/card-model';
import { Field, INPUT } from '@/features/transactions/field';
import { AmountField, CurrencyField, FormFooter } from '@/features/transactions/form-parts';

import {
  checkGoalDraft,
  type GoalBody,
  type GoalDraft,
  goalApiError,
  GOAL_NAME_MAX_LENGTH,
} from './goal-model';
import type { SaveOutcome } from './queries';
import { useCheckedForm } from './use-checked-form';

interface GoalFormProps {
  initial: GoalDraft;
  /** Al crearla se elige la moneda; después queda fija. */
  creating: boolean;
  save: (body: GoalBody) => Promise<SaveOutcome>;
  onDone: () => void;
}

/** Crear o corregir una meta: nombre, cuánto quieres juntar y entre qué fechas. */
export function GoalForm({ initial, creating, save, onDone }: Readonly<GoalFormProps>) {
  const form = useCheckedForm({
    initial,
    check: checkGoalDraft,
    save,
    place: goalApiError,
    onSaved: onDone,
  });
  const { values, set, errors } = form;

  return (
    <form noValidate onSubmit={(event) => void form.submit(event)} className="flex flex-col gap-4">
      <Field label="Nombre" error={errors.name}>
        {(control) => (
          <input
            {...control}
            maxLength={GOAL_NAME_MAX_LENGTH}
            autoComplete="off"
            placeholder="Viaje a Cusco"
            value={values.name}
            onChange={(event) => {
              set('name', event.target.value);
            }}
            className={INPUT}
          />
        )}
      </Field>

      {creating ? (
        <CurrencyField
          value={values.currency}
          error={errors.currency}
          onChange={(currency) => {
            set('currency', currency);
          }}
        />
      ) : (
        values.currency !== null && (
          <p className="text-sm text-stone-600">
            Moneda: {CURRENCY_SYMBOLS[values.currency]} (no se cambia)
          </p>
        )
      )}

      <AmountField
        name="targetAmount"
        label="Cuánto quieres juntar"
        value={values.targetAmount}
        error={errors.targetAmount}
        onChange={(amount) => {
          set('targetAmount', amount);
        }}
      />

      <div className="grid grid-cols-2 gap-3">
        <Field label="Desde" error={errors.startDate}>
          {(control) => (
            <input
              {...control}
              type="date"
              value={values.startDate}
              onChange={(event) => {
                set('startDate', event.target.value);
              }}
              className={INPUT}
            />
          )}
        </Field>
        <Field label="Hasta" error={errors.endDate}>
          {(control) => (
            <input
              {...control}
              type="date"
              value={values.endDate}
              onChange={(event) => {
                set('endDate', event.target.value);
              }}
              className={INPUT}
            />
          )}
        </Field>
      </div>

      <FormFooter error={form.formError} pending={form.pending} />
      <button
        type="button"
        disabled={form.pending}
        onClick={onDone}
        className="rounded-md border border-stone-300 px-4 py-3 font-medium hover:bg-stone-50"
      >
        Cancelar
      </button>
    </form>
  );
}
