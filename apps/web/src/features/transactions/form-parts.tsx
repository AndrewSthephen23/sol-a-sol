'use client';

import type { UseMutationResult } from '@tanstack/react-query';
import { useState } from 'react';
import type { SubmitEvent } from 'react';

import { errorMessage, NETWORK_ERROR } from '@/shared/api/problem';
import type { Currency } from '@/shared/format/money';

import { Field, INPUT } from './field';
import type { Option, OptionGroup } from './form-options';
import {
  type Checked,
  type FieldErrors,
  type FormError,
  formErrorFor,
} from './movement-form-model';
import type { Outcome } from './mutations';

interface MovementFormOptions<V, B, F extends string> {
  initial: V;
  /** Revisa lo escrito y arma el cuerpo, o dice qué campos están mal. */
  check: (values: V) => Checked<B, F>;
  save: UseMutationResult<Outcome, Error, B>;
  /** Puede seguir trabajando (guardar las cuotas): el botón sigue desactivado hasta que termine. */
  onSaved: (body: B, outcome: Extract<Outcome, { ok: true }>) => void | Promise<void>;
  /** Dónde va cada error de la API; por defecto, como en los movimientos. */
  placeError?: (code: string | null) => FormError<string> | null;
}

/**
 * Lo común a registrar una transacción y una transferencia: los valores, revisarlos, guardar
 * **una sola vez** aunque se pulse de nuevo, y poner cada error de la API junto a su campo (o
 * arriba del botón si no tiene uno).
 */
export function useMovementForm<V extends object, B, F extends string>({
  initial,
  check,
  save,
  onSaved,
  placeError = formErrorFor,
}: MovementFormOptions<V, B, F>) {
  const [values, setValues] = useState(initial);
  const [errors, setErrors] = useState<FieldErrors<F>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [finishing, setFinishing] = useState(false);

  function set<K extends keyof V>(field: K, value: V[K]) {
    setValues((current) => ({ ...current, [field]: value }));
  }

  async function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (save.isPending || finishing) return;
    const checked = check(values);
    setFormError(null);
    if ('errors' in checked) {
      setErrors(checked.errors);

      return;
    }
    setErrors({});
    try {
      const outcome = await save.mutateAsync(checked.body);
      if (outcome.ok) {
        setFinishing(true);
        try {
          await onSaved(checked.body, outcome);
        } finally {
          setFinishing(false);
        }

        return;
      }
      const placed = placeError(outcome.code);
      if (placed?.field !== undefined && placed.field in values) {
        setErrors({ [placed.field]: placed.message } as FieldErrors<F>);
      } else {
        setFormError(placed?.message ?? errorMessage(outcome.code));
      }
    } catch {
      setFormError(NETWORK_ERROR);
    }
  }

  return { values, set, errors, formError, pending: save.isPending || finishing, submit };
}

/**
 * Un monto: se escribe como texto y se manda como texto. `inputMode="decimal"` abre el teclado
 * numérico en el teléfono.
 */
export function AmountField({
  name,
  label,
  value,
  error,
  hint,
  large = false,
  onChange,
}: Readonly<{
  name: string;
  label: string;
  value: string;
  error: string | undefined;
  hint?: string;
  large?: boolean;
  onChange: (amount: string) => void;
}>) {
  return (
    <Field label={label} error={error} {...(hint === undefined ? {} : { hint })}>
      {(control) => (
        <input
          {...control}
          name={name}
          inputMode="decimal"
          autoComplete="off"
          placeholder="0.00"
          value={value}
          onChange={(event) => {
            onChange(event.target.value);
          }}
          className={large ? `${INPUT} text-2xl font-semibold` : INPUT}
        />
      )}
    </Field>
  );
}

/** Opcional: si queda vacía, se usa la que se propone (la pista la dice). */
export function DescriptionField({
  value,
  error,
  proposed,
  onChange,
}: Readonly<{
  value: string;
  error: string | undefined;
  proposed: string | undefined;
  onChange: (description: string) => void;
}>) {
  return (
    <Field
      label="Descripción"
      error={error}
      {...(proposed === undefined ? {} : { hint: `Si la dejas vacía: «${proposed}».` })}
    >
      {(control) => (
        <input
          {...control}
          name="description"
          maxLength={200}
          value={value}
          onChange={(event) => {
            onChange(event.target.value);
          }}
          className={INPUT}
        />
      )}
    </Field>
  );
}

/** Sin valor por defecto: nunca se suponen soles (decidido con el autor el 2026-09-28). */
export function CurrencyField({
  value,
  error,
  onChange,
}: Readonly<{
  value: Currency | null;
  error: string | undefined;
  onChange: (currency: Currency | null) => void;
}>) {
  return (
    <Field label="Moneda" error={error}>
      {(control) => (
        <select
          {...control}
          name="currency"
          value={value ?? ''}
          onChange={(event) => {
            onChange((event.target.value || null) as Currency | null);
          }}
          className={INPUT}
        >
          <option value="">Elige la moneda</option>
          <option value="PEN">Soles (S/)</option>
          <option value="USD">Dólares (US$)</option>
        </select>
      )}
    </Field>
  );
}

/** Hasta hoy en Lima: se registra lo que ya pasó. */
export function DateField({
  value,
  today,
  error,
  onChange,
}: Readonly<{
  value: string;
  today: string;
  error: string | undefined;
  onChange: (date: string) => void;
}>) {
  return (
    <Field label="Fecha" error={error}>
      {(control) => (
        <input
          {...control}
          type="date"
          name="date"
          max={today}
          value={value}
          onChange={(event) => {
            onChange(event.target.value);
          }}
          className={INPUT}
        />
      )}
    </Field>
  );
}

/** El error sin campo y el botón, que se desactiva mientras se guarda. */
export function FormFooter({
  error,
  pending,
}: Readonly<{ error: string | null; pending: boolean }>) {
  return (
    <>
      {error !== null && (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}
      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-amber-500 px-4 py-3 text-base font-semibold text-white hover:bg-amber-600 disabled:opacity-50"
      >
        {pending ? 'Guardando…' : 'Guardar'}
      </button>
    </>
  );
}

/** La categoría, agrupada por tipo (`categoryGroups`): el tipo del movimiento sale de ella. */
export function CategoryField({
  value,
  groups,
  error,
  onChange,
}: Readonly<{
  value: string;
  groups: readonly OptionGroup[];
  error: string | undefined;
  onChange: (categoryId: string) => void;
}>) {
  return (
    <Field label="Categoría" error={error}>
      {(control) => (
        <select
          {...control}
          name="categoryId"
          value={value}
          onChange={(event) => {
            onChange(event.target.value);
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
  );
}

/** El método de pago, opcional (`paymentMethodOptions`). */
export function PaymentMethodField({
  value,
  options,
  error,
  onChange,
}: Readonly<{
  value: string | null;
  options: readonly Option[];
  error: string | undefined;
  onChange: (paymentMethodId: string | null) => void;
}>) {
  return (
    <Field label="Método de pago" error={error}>
      {(control) => (
        <select
          {...control}
          name="paymentMethodId"
          value={value ?? ''}
          onChange={(event) => {
            onChange(event.target.value || null);
          }}
          className={INPUT}
        >
          <option value="">Sin método de pago</option>
          {options.map((option) => (
            <option key={option.id} value={option.id}>
              {option.label}
            </option>
          ))}
        </select>
      )}
    </Field>
  );
}
