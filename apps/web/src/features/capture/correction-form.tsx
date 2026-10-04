'use client';

import { useMemo } from 'react';

import { Field, INPUT } from '@/features/transactions/field';
import { categoryGroups, paymentMethodOptions } from '@/features/transactions/form-options';
import {
  AmountField,
  CategoryField,
  CurrencyField,
  DateField,
  DescriptionField,
  FormFooter,
  PaymentMethodField,
  useMovementForm,
} from '@/features/transactions/form-parts';
import { fixedCurrency } from '@/features/transactions/movement-form-model';
import type { Category, PaymentMethod } from '@/features/transactions/queries';

import { type Capture, checkCorrection, correctionValuesFor } from './capture-model';
import { useCorrectCapture } from './queries';

interface CorrectionFormProps {
  capture: Capture;
  categories: readonly Category[];
  paymentMethods: readonly PaymentMethod[];
  today: string;
  onDone: () => void;
}

/**
 * Corregir una captura **en su propia tarjeta** (decisión 10; decidido el 2026-10-04): todo se
 * corrige, y el tipo sale de la categoría. Los errores de la API van junto a su campo.
 */
export function CorrectionForm({
  capture,
  categories,
  paymentMethods,
  today,
  onDone,
}: Readonly<CorrectionFormProps>) {
  const save = useCorrectCapture(capture.id);
  const context = useMemo(
    () => ({ categories, paymentMethods, today }),
    [categories, paymentMethods, today],
  );
  const groups = useMemo(
    () => categoryGroups(categories, capture.categoryId),
    [categories, capture.categoryId],
  );
  const methods = useMemo(
    () => paymentMethodOptions(paymentMethods, capture.paymentMethodId),
    [paymentMethods, capture.paymentMethodId],
  );
  const { values, set, errors, formError, pending, submit } = useMovementForm({
    initial: correctionValuesFor(capture),
    check: (current) => checkCorrection(current, context),
    save,
    onSaved: onDone,
  });
  const methodCurrency = fixedCurrency(
    paymentMethods.find(({ id }) => id === values.paymentMethodId),
  );

  return (
    <form noValidate onSubmit={(event) => void submit(event)} className="flex flex-col gap-4">
      <AmountField
        name="amount"
        label="Monto"
        value={values.amount}
        error={errors.amount}
        onChange={(amount) => {
          set('amount', amount);
        }}
      />
      {methodCurrency === null && (
        <CurrencyField
          value={values.currency}
          error={errors.currency}
          onChange={(currency) => {
            set('currency', currency);
          }}
        />
      )}
      <CategoryField
        value={values.categoryId}
        groups={groups}
        error={errors.categoryId}
        onChange={(categoryId) => {
          set('categoryId', categoryId);
        }}
      />
      <PaymentMethodField
        value={values.paymentMethodId}
        options={methods}
        error={errors.paymentMethodId}
        onChange={(paymentMethodId) => {
          set('paymentMethodId', paymentMethodId);
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
      <Field label="Comercio" error={errors.merchant}>
        {(control) => (
          <input
            {...control}
            name="merchant"
            maxLength={120}
            value={values.merchant}
            onChange={(event) => {
              set('merchant', event.target.value);
            }}
            className={INPUT}
          />
        )}
      </Field>
      <DescriptionField
        value={values.description}
        error={errors.description}
        proposed={values.merchant.trim() || undefined}
        onChange={(description) => {
          set('description', description);
        }}
      />
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
