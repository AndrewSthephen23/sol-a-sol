'use client';

import { useState } from 'react';

import { errorMessage, NETWORK_ERROR } from '@/shared/api/problem';
import type { Currency } from '@/shared/format/money';
import { Field, INPUT } from '@/features/transactions/field';

import {
  acceptedCurrencies,
  type CardBody,
  type CardDraft,
  type CardField,
  cardApiError,
  checkCardDraft,
  CURRENCY_SYMBOLS,
} from './card-model';
import type { CardSaveOutcome } from './queries';

interface CardFormProps {
  initial: CardDraft;
  /** Nula = bimoneda: la línea puede ir en soles o dólares, y el saldo inicial en las dos. */
  methodCurrency: Currency | null;
  save: (body: CardBody) => Promise<CardSaveOutcome>;
  onDone: () => void;
}

/**
 * Configurar o corregir una tarjeta: línea, día de corte, fecha límite de pago y, si ya se debía
 * algo al empezar, el saldo inicial. **Nunca** se pide el número completo, el CVV ni el
 * vencimiento del plástico: la tarjeta ya se identifica por su alias y sus últimos 4.
 */
export function CardForm({ initial, methodCurrency, save, onDone }: Readonly<CardFormProps>) {
  const [draft, setDraft] = useState<CardDraft>(initial);
  const [errors, setErrors] = useState<Partial<Record<CardField, string>>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const accepted = acceptedCurrencies(methodCurrency);

  function change(patch: Partial<CardDraft>) {
    setDraft((current) => ({ ...current, ...patch }));
  }

  async function submit() {
    if (saving) return;
    const checked = checkCardDraft(draft, accepted);
    if ('errors' in checked) {
      setErrors(checked.errors);
      setFormError('Revisa los campos marcados.');

      return;
    }
    setErrors({});
    setFormError(null);
    setSaving(true);
    try {
      const outcome = await save(checked.body);
      if (outcome.ok) {
        onDone();

        return;
      }
      const known = cardApiError(outcome.code);
      if (known?.field != null) setErrors({ [known.field]: known.message });
      else setFormError(known?.message ?? errorMessage(outcome.code));
    } catch {
      setFormError(NETWORK_ERROR);
    } finally {
      setSaving(false);
    }
  }

  const daysAfter = draft.rule === 'DAYS_AFTER_STATEMENT';

  return (
    <form
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
      className="flex flex-col gap-4"
    >
      <div className="grid grid-cols-[1fr_auto] items-end gap-2">
        <Field label="Línea de crédito" error={errors.creditLimit}>
          {(control) => (
            <input
              {...control}
              inputMode="decimal"
              autoComplete="off"
              placeholder="5000.00"
              value={draft.creditLimit}
              onChange={(event) => {
                change({ creditLimit: event.target.value });
              }}
              className={INPUT}
            />
          )}
        </Field>
        {accepted.length > 1 ? (
          <select
            aria-label="Moneda de la línea"
            value={draft.creditLimitCurrency}
            onChange={(event) => {
              change({ creditLimitCurrency: event.target.value as Currency });
            }}
            className={`${INPUT} mb-0`}
          >
            <option value="PEN">S/</option>
            <option value="USD">US$</option>
          </select>
        ) : (
          <span className="pb-2 text-stone-600">{CURRENCY_SYMBOLS[draft.creditLimitCurrency]}</span>
        )}
      </div>

      <Field
        label="Día de corte"
        error={errors.statementDay}
        hint="Si el mes no tiene ese día, el corte cae el último día del mes."
      >
        {(control) => (
          <input
            {...control}
            inputMode="numeric"
            autoComplete="off"
            placeholder="20"
            value={draft.statementDay}
            onChange={(event) => {
              change({ statementDay: event.target.value });
            }}
            className={INPUT}
          />
        )}
      </Field>

      <fieldset className="flex flex-col gap-2 text-sm">
        <legend className="font-medium">Fecha límite de pago</legend>
        <label className="flex items-center gap-2">
          <input
            type="radio"
            name="rule"
            checked={daysAfter}
            onChange={() => {
              change({ rule: 'DAYS_AFTER_STATEMENT' });
            }}
          />
          Unos días después del corte
        </label>
        <label className="flex items-center gap-2">
          <input
            type="radio"
            name="rule"
            checked={!daysAfter}
            onChange={() => {
              change({ rule: 'DAY_OF_MONTH' });
            }}
          />
          Un día fijo del mes
        </label>
        <Field
          label={daysAfter ? 'Días después del corte' : 'Día del mes'}
          error={errors.ruleValue}
        >
          {(control) => (
            <input
              {...control}
              inputMode="numeric"
              autoComplete="off"
              placeholder={daysAfter ? '25' : '5'}
              value={draft.ruleValue}
              onChange={(event) => {
                change({ ruleValue: event.target.value });
              }}
              className={INPUT}
            />
          )}
        </Field>
      </fieldset>

      <fieldset className="flex flex-col gap-2 text-sm">
        <legend className="font-medium">Saldo inicial</legend>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={draft.hasOpeningBalance}
            onChange={(event) => {
              change({ hasOpeningBalance: event.target.checked });
            }}
          />
          Ya debía algo antes de registrar en la app
        </label>
        {draft.hasOpeningBalance && (
          <div className="flex flex-col gap-2">
            <Field label="Desde el día" error={undefined}>
              {(control) => (
                <input
                  {...control}
                  type="date"
                  value={draft.openingDate}
                  onChange={(event) => {
                    change({ openingDate: event.target.value });
                  }}
                  className={INPUT}
                />
              )}
            </Field>
            {accepted.map((currency) => (
              <Field
                key={currency}
                label={`Debía en ${CURRENCY_SYMBOLS[currency]}`}
                error={undefined}
              >
                {(control) => (
                  <input
                    {...control}
                    inputMode="decimal"
                    autoComplete="off"
                    placeholder="0.00"
                    value={currency === 'PEN' ? draft.openingPen : draft.openingUsd}
                    onChange={(event) => {
                      change(
                        currency === 'PEN'
                          ? { openingPen: event.target.value }
                          : { openingUsd: event.target.value },
                      );
                    }}
                    className={INPUT}
                  />
                )}
              </Field>
            ))}
            {errors.openingBalance !== undefined && (
              <p role="alert" className="text-red-700">
                {errors.openingBalance}
              </p>
            )}
          </div>
        )}
      </fieldset>

      {formError !== null && (
        <p role="alert" className="text-sm text-red-700">
          {formError}
        </p>
      )}

      <div className="flex gap-3">
        <button
          type="submit"
          disabled={saving}
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
    </form>
  );
}
