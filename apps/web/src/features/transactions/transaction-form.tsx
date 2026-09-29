'use client';

import { useMemo, useState } from 'react';
import type { SubmitEvent } from 'react';

import { errorMessage, NETWORK_ERROR } from '@/shared/api/problem';
import type { Currency } from '@/shared/format/money';

import { Field, INPUT } from './field';
import { categoryGroups, lastPaymentMethod, paymentMethodOptions } from './form-options';
import { categoriesById } from './labels';
import {
  checkTransaction,
  type FieldErrors,
  fixedCurrency,
  formErrorFor,
  type TransactionField,
  type TransactionValues,
} from './movement-form-model';
import { useSaveTransaction } from './mutations';
import type { Category, PaymentMethod } from './queries';

interface TransactionFormProps {
  /** `null` al registrar; el id al corregir. */
  id: string | null;
  initial: TransactionValues;
  categories: readonly Category[];
  paymentMethods: readonly PaymentMethod[];
  today: string;
  /** Tras guardar: recibe la fecha para volver a su mes. */
  onSaved: (date: string) => void;
}

/**
 * Registrar o corregir una transacción. A la vista solo lo necesario —monto, categoría, método
 * y fecha—; descripción, comercio y etiquetas van plegados. El tipo sale de la categoría.
 *
 * El monto se escribe y se manda **como texto**, y el botón se desactiva mientras se guarda: no
 * se puede enviar dos veces.
 */
export function TransactionForm({
  id,
  initial,
  categories,
  paymentMethods,
  today,
  onSaved,
}: Readonly<TransactionFormProps>) {
  const [values, setValues] = useState(initial);
  const [errors, setErrors] = useState<FieldErrors<TransactionField>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const save = useSaveTransaction(id);

  const context = useMemo(
    () => ({
      categories: categoriesById(categories),
      paymentMethods: new Map(paymentMethods.map((method) => [method.id, method])),
      today,
    }),
    [categories, paymentMethods, today],
  );
  const groups = useMemo(
    () => categoryGroups(categories, initial.categoryId || null),
    [categories, initial.categoryId],
  );
  const methods = useMemo(
    () => paymentMethodOptions(paymentMethods, initial.paymentMethodId),
    [paymentMethods, initial.paymentMethodId],
  );
  const method =
    values.paymentMethodId === null
      ? undefined
      : context.paymentMethods.get(values.paymentMethodId);
  const methodCurrency = fixedCurrency(method);
  const proposed = context.categories.get(values.categoryId)?.name;

  function set<K extends keyof TransactionValues>(field: K, value: TransactionValues[K]) {
    setValues((current) => ({ ...current, [field]: value }));
  }

  async function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (save.isPending) return;
    const checked = checkTransaction(values, context);
    if ('errors' in checked) {
      setErrors(checked.errors);
      setFormError(null);

      return;
    }
    setErrors({});
    setFormError(null);
    try {
      const outcome = await save.mutateAsync(checked.body);
      if (outcome.ok) {
        lastPaymentMethod.write(checked.body.paymentMethodId ?? null);
        onSaved(checked.body.date);

        return;
      }
      const placed = formErrorFor(outcome.code);
      if (placed?.field !== undefined && placed.field in values) {
        setErrors({ [placed.field]: placed.message });
      } else {
        setFormError(placed?.message ?? errorMessage(outcome.code));
      }
    } catch {
      setFormError(NETWORK_ERROR);
    }
  }

  return (
    <form noValidate onSubmit={(event) => void submit(event)} className="flex flex-col gap-4">
      <Field label="Monto" error={errors.amount}>
        {(control) => (
          <input
            {...control}
            name="amount"
            inputMode="decimal"
            autoComplete="off"
            placeholder="0.00"
            value={values.amount}
            onChange={(event) => {
              set('amount', event.target.value);
            }}
            className={`${INPUT} text-2xl font-semibold`}
          />
        )}
      </Field>

      <Field label="Categoría" error={errors.categoryId}>
        {(control) => (
          <select
            {...control}
            name="categoryId"
            value={values.categoryId}
            onChange={(event) => {
              set('categoryId', event.target.value);
            }}
            className={INPUT}
          >
            <option value="">Elige una categoría</option>
            {groups.map((group) => (
              <optgroup key={group.label} label={group.label}>
                {group.options.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        )}
      </Field>

      <Field label="Método de pago" error={errors.paymentMethodId}>
        {(control) => (
          <select
            {...control}
            name="paymentMethodId"
            value={values.paymentMethodId ?? ''}
            onChange={(event) => {
              set('paymentMethodId', event.target.value || null);
            }}
            className={INPUT}
          >
            <option value="">Sin método de pago</option>
            {methods.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
        )}
      </Field>

      {/* Solo si el método no fija la moneda. Sin valor por defecto: nunca se suponen soles. */}
      {methodCurrency === null && (
        <Field label="Moneda" error={errors.currency}>
          {(control) => (
            <select
              {...control}
              name="currency"
              value={values.currency ?? ''}
              onChange={(event) => {
                set('currency', (event.target.value || null) as Currency | null);
              }}
              className={INPUT}
            >
              <option value="">Elige la moneda</option>
              <option value="PEN">Soles (S/)</option>
              <option value="USD">Dólares (US$)</option>
            </select>
          )}
        </Field>
      )}

      <Field label="Fecha" error={errors.date}>
        {(control) => (
          <input
            {...control}
            type="date"
            name="date"
            max={today}
            value={values.date}
            onChange={(event) => {
              set('date', event.target.value);
            }}
            className={INPUT}
          />
        )}
      </Field>

      <details
        open={
          id !== null ||
          errors.tags !== undefined ||
          values.description !== '' ||
          values.merchant !== '' ||
          values.tags !== ''
        }
        className="flex flex-col gap-4"
      >
        <summary className="cursor-pointer text-sm font-medium text-stone-700">
          Más detalles
        </summary>
        <div className="mt-3 flex flex-col gap-4">
          <Field
            label="Descripción"
            error={errors.description}
            {...(proposed === undefined ? {} : { hint: `Si la dejas vacía: «${proposed}».` })}
          >
            {(control) => (
              <input
                {...control}
                name="description"
                maxLength={200}
                value={values.description}
                onChange={(event) => {
                  set('description', event.target.value);
                }}
                className={INPUT}
              />
            )}
          </Field>
          <Field label="Comercio" error={errors.merchant}>
            {(control) => (
              <input
                {...control}
                name="merchant"
                maxLength={80}
                value={values.merchant}
                onChange={(event) => {
                  set('merchant', event.target.value);
                }}
                className={INPUT}
              />
            )}
          </Field>
          <Field label="Etiquetas" error={errors.tags} hint="Separadas por comas: viaje, trabajo.">
            {(control) => (
              <input
                {...control}
                name="tags"
                autoComplete="off"
                value={values.tags}
                onChange={(event) => {
                  set('tags', event.target.value);
                }}
                className={INPUT}
              />
            )}
          </Field>
        </div>
      </details>

      {formError !== null && (
        <p role="alert" className="text-sm text-red-700">
          {formError}
        </p>
      )}

      <button
        type="submit"
        disabled={save.isPending}
        className="rounded-md bg-amber-500 px-4 py-3 text-base font-semibold text-white hover:bg-amber-600 disabled:opacity-50"
      >
        {save.isPending ? 'Guardando…' : 'Guardar'}
      </button>
    </form>
  );
}
