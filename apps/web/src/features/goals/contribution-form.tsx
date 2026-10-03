'use client';

import { formatMoney } from '@/shared/format/money';
import { formatDayMonth } from '@/shared/time/dates';
import { Field, INPUT } from '@/features/transactions/field';
import { AmountField, DateField, FormFooter } from '@/features/transactions/form-parts';

import {
  checkContributionDraft,
  contributionApiError,
  emptyContribution,
  type Goal,
} from './goal-model';
import { useAddContribution, useSavingTransactions } from './queries';
import { useCheckedForm } from './use-checked-form';

/**
 * Aportar a una meta: un aporte o un retiro escrito a mano, o una transacción de ahorro que ya
 * registraste (la meta la toma entera y la sigue si la corriges).
 */
export function ContributionForm({
  goal,
  today,
  onDone,
}: Readonly<{ goal: Goal; today: string; onDone: () => void }>) {
  const add = useAddContribution();
  const form = useCheckedForm({
    initial: emptyContribution(today),
    check: (draft) => checkContributionDraft(draft, goal.currency, today),
    save: (body) => add.mutateAsync({ goalId: goal.id, body }),
    place: contributionApiError,
    onSaved: onDone,
  });
  const { values, set, errors } = form;
  const linking = values.source === 'TRANSACTION';
  const savings = useSavingTransactions(goal.currency, linking);

  return (
    <form noValidate onSubmit={(event) => void form.submit(event)} className="flex flex-col gap-4">
      <fieldset className="flex flex-col gap-2 text-sm">
        <legend className="font-medium">De dónde sale</legend>
        <label className="flex items-center gap-2">
          <input
            type="radio"
            name={`source-${goal.id}`}
            checked={!linking}
            onChange={() => {
              set('source', 'MANUAL');
            }}
          />
          Lo escribo a mano
        </label>
        <label className="flex items-center gap-2">
          <input
            type="radio"
            name={`source-${goal.id}`}
            checked={linking}
            onChange={() => {
              set('source', 'TRANSACTION');
            }}
          />
          Una transacción de ahorro que ya registré
        </label>
      </fieldset>

      {linking ? (
        <Field label="Transacción" error={errors.transactionId}>
          {(control) => (
            <select
              {...control}
              value={values.transactionId}
              onChange={(event) => {
                set('transactionId', event.target.value);
              }}
              className={INPUT}
            >
              <option value="">Elige la transacción</option>
              {savings.map((movement) => (
                <option key={movement.id} value={movement.id}>
                  {formatDayMonth(movement.date)} · {movement.description} ·{' '}
                  {formatMoney(movement.amount, goal.currency)}
                </option>
              ))}
            </select>
          )}
        </Field>
      ) : (
        <>
          <fieldset className="flex gap-4 text-sm">
            <legend className="sr-only">Aporte o retiro</legend>
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name={`kind-${goal.id}`}
                checked={values.kind === 'CONTRIBUTION'}
                onChange={() => {
                  set('kind', 'CONTRIBUTION');
                }}
              />
              Aporte
            </label>
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name={`kind-${goal.id}`}
                checked={values.kind === 'WITHDRAWAL'}
                onChange={() => {
                  set('kind', 'WITHDRAWAL');
                }}
              />
              Retiro
            </label>
          </fieldset>
          <AmountField
            name="amount"
            label="Monto"
            value={values.amount}
            error={errors.amount}
            onChange={(amount) => {
              set('amount', amount);
            }}
          />
          <DateField
            value={values.date}
            today={today}
            error={errors.date}
            onChange={(date) => {
              set('date', date);
            }}
          />
        </>
      )}

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
