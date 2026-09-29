'use client';

import { useMemo, useState } from 'react';
import type { SubmitEvent } from 'react';

import { errorMessage, NETWORK_ERROR } from '@/shared/api/problem';
import type { Currency } from '@/shared/format/money';

import { Field, INPUT } from './field';
import { paymentMethodOptions } from './form-options';
import {
  checkTransfer,
  type FieldErrors,
  fixedCurrency,
  formErrorFor,
  type TransferField,
  type TransferValues,
} from './movement-form-model';
import { useSaveTransfer } from './mutations';
import type { PaymentMethod } from './queries';

interface TransferFormProps {
  id: string | null;
  initial: TransferValues;
  paymentMethods: readonly PaymentMethod[];
  today: string;
  onSaved: (date: string) => void;
}

const CURRENCY_LABELS: Readonly<Record<Currency, string>> = { PEN: 'soles', USD: 'dólares' };

/**
 * Registrar o corregir una transferencia entre cuentas propias. Si la moneda cambia, se pide lo
 * que llegó (del voucher): nunca se convierte.
 */
export function TransferForm({
  id,
  initial,
  paymentMethods,
  today,
  onSaved,
}: Readonly<TransferFormProps>) {
  const [values, setValues] = useState(initial);
  const [errors, setErrors] = useState<FieldErrors<TransferField>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const save = useSaveTransfer(id);

  const context = useMemo(
    () => ({
      categories: new Map(),
      paymentMethods: new Map(paymentMethods.map((method) => [method.id, method])),
      today,
    }),
    [paymentMethods, today],
  );
  const fromOptions = useMemo(
    () => paymentMethodOptions(paymentMethods, initial.fromPaymentMethodId || null),
    [paymentMethods, initial.fromPaymentMethodId],
  );
  const toOptions = useMemo(
    () => paymentMethodOptions(paymentMethods, initial.toPaymentMethodId || null),
    [paymentMethods, initial.toPaymentMethodId],
  );
  const from = context.paymentMethods.get(values.fromPaymentMethodId);
  const to = context.paymentMethods.get(values.toPaymentMethodId);
  const sent = fixedCurrency(from) ?? values.currency;
  const received = fixedCurrency(to) ?? sent;
  const changes = sent !== null && received !== null && sent !== received;

  function set<K extends keyof TransferValues>(field: K, value: TransferValues[K]) {
    setValues((current) => ({ ...current, [field]: value }));
  }

  async function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (save.isPending) return;
    const checked = checkTransfer(values, context);
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

  const accountSelect = (field: 'fromPaymentMethodId' | 'toPaymentMethodId', label: string) => (
    <Field label={label} error={errors[field]}>
      {(control) => (
        <select
          {...control}
          name={field}
          value={values[field]}
          onChange={(event) => {
            set(field, event.target.value);
          }}
          className={INPUT}
        >
          <option value="">Elige una cuenta</option>
          {(field === 'fromPaymentMethodId' ? fromOptions : toOptions).map((option) => (
            <option key={option.id} value={option.id}>
              {option.label}
            </option>
          ))}
        </select>
      )}
    </Field>
  );

  return (
    <form noValidate onSubmit={(event) => void submit(event)} className="flex flex-col gap-4">
      <Field
        label={changes ? `Monto enviado (${CURRENCY_LABELS[sent]})` : 'Monto'}
        error={errors.amount}
      >
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

      {accountSelect('fromPaymentMethodId', 'Desde')}
      {accountSelect('toPaymentMethodId', 'Hacia')}

      {from !== undefined && fixedCurrency(from) === null && (
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

      {changes && (
        <Field
          label={`Monto recibido (${CURRENCY_LABELS[received]})`}
          error={errors.receivedAmount}
          hint="Cópialo del voucher: el tipo de cambio nunca se calcula."
        >
          {(control) => (
            <input
              {...control}
              name="receivedAmount"
              inputMode="decimal"
              autoComplete="off"
              placeholder="0.00"
              value={values.receivedAmount}
              onChange={(event) => {
                set('receivedAmount', event.target.value);
              }}
              className={INPUT}
            />
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

      <details open={id !== null || values.description !== ''}>
        <summary className="cursor-pointer text-sm font-medium text-stone-700">
          Más detalles
        </summary>
        <div className="mt-3">
          <Field
            label="Descripción"
            error={errors.description}
            {...(from !== undefined && to !== undefined
              ? { hint: `Si la dejas vacía: «Transferencia ${from.alias} → ${to.alias}».` }
              : {})}
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
