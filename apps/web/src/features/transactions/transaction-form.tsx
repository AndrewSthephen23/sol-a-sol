'use client';

import { useMemo } from 'react';

import { Field, INPUT } from './field';
import { categoryGroups, lastPaymentMethod, paymentMethodOptions } from './form-options';
import {
  AmountField,
  CurrencyField,
  DateField,
  DescriptionField,
  FormFooter,
  useMovementForm,
} from './form-parts';
import { categoriesById } from './labels';
import { checkTransaction, fixedCurrency, type TransactionValues } from './movement-form-model';
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
  const { values, set, errors, formError, pending, submit } = useMovementForm({
    initial,
    check: (current: TransactionValues) => checkTransaction(current, context),
    save,
    onSaved: (body) => {
      lastPaymentMethod.write(body.paymentMethodId ?? null);
      onSaved(body.date);
    },
  });
  const method =
    values.paymentMethodId === null
      ? undefined
      : context.paymentMethods.get(values.paymentMethodId);
  const methodCurrency = fixedCurrency(method);
  const proposed = context.categories.get(values.categoryId)?.name;

  return (
    <form noValidate onSubmit={(event) => void submit(event)} className="flex flex-col gap-4">
      <AmountField
        name="amount"
        label="Monto"
        large
        value={values.amount}
        error={errors.amount}
        onChange={(amount) => {
          set('amount', amount);
        }}
      />

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
        <CurrencyField
          value={values.currency}
          error={errors.currency}
          onChange={(currency) => {
            set('currency', currency);
          }}
        />
      )}

      <DateField
        value={values.date}
        today={today}
        error={errors.date}
        onChange={(date) => {
          set('date', date);
        }}
      />

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
          <DescriptionField
            value={values.description}
            error={errors.description}
            proposed={proposed}
            onChange={(description) => {
              set('description', description);
            }}
          />
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

      <FormFooter error={formError} pending={pending} />
    </form>
  );
}
