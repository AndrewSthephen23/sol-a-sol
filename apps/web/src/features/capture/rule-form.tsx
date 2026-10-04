'use client';

import { useMemo } from 'react';

import { Field, INPUT } from '@/features/transactions/field';
import { categoryGroups } from '@/features/transactions/form-options';
import { CategoryField, FormFooter, useMovementForm } from '@/features/transactions/form-parts';
import type { Category } from '@/features/transactions/queries';

import { useSaveRule } from './queries';
import { checkRule, type Rule, ruleErrorFor, ruleValuesFor } from './rules-model';

/**
 * Crear o corregir una regla (decisión 12): si el comercio (o, sin comercio, el texto de la
 * notificación) **contiene** el texto, sin tildes ni mayúsculas, se sugiere la categoría. Los
 * errores de la API van junto a su campo.
 */
export function RuleForm({
  rule,
  categories,
  onDone,
}: Readonly<{ rule: Rule | null; categories: readonly Category[]; onDone: () => void }>) {
  const save = useSaveRule(rule?.id ?? null);
  const groups = useMemo(
    () => categoryGroups(categories, rule?.categoryId ?? null),
    [categories, rule?.categoryId],
  );
  const { values, set, errors, formError, pending, submit } = useMovementForm({
    initial: ruleValuesFor(rule),
    check: checkRule,
    save,
    onSaved: onDone,
    placeError: ruleErrorFor,
  });

  return (
    <form noValidate onSubmit={(event) => void submit(event)} className="flex flex-col gap-4">
      <Field
        label="Si el comercio contiene"
        error={errors.pattern}
        hint="Sin importar tildes ni mayúsculas: «tambo» reconoce «TAMBO Larco»."
      >
        {(control) => (
          <input
            {...control}
            name="pattern"
            maxLength={120}
            autoComplete="off"
            value={values.pattern}
            onChange={(event) => {
              set('pattern', event.target.value);
            }}
            className={INPUT}
          />
        )}
      </Field>
      <CategoryField
        value={values.categoryId}
        groups={groups}
        error={errors.categoryId}
        onChange={(categoryId) => {
          set('categoryId', categoryId);
        }}
      />
      <Field
        label="Prioridad"
        error={errors.priority}
        hint="Si aplican dos reglas, gana la de mayor prioridad; con la misma, la más larga."
      >
        {(control) => (
          <input
            {...control}
            name="priority"
            inputMode="numeric"
            autoComplete="off"
            value={values.priority}
            onChange={(event) => {
              set('priority', event.target.value);
            }}
            className={INPUT}
          />
        )}
      </Field>
      <FormFooter error={formError} pending={pending} />
      <button
        type="button"
        onClick={onDone}
        className="text-sm font-medium text-stone-600 underline"
      >
        Cancelar
      </button>
    </form>
  );
}
