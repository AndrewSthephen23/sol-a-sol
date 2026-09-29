'use client';

import { useMemo } from 'react';

import type { Currency } from '@/shared/format/money';

import { Field, INPUT } from './field';
import { paymentMethodOptions } from './form-options';
import {
  AmountField,
  CurrencyField,
  DateField,
  DescriptionField,
  FormFooter,
  useMovementForm,
} from './form-parts';
import { checkTransfer, fixedCurrency, type TransferValues } from './movement-form-model';
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
  const { values, set, errors, formError, pending, submit } = useMovementForm({
    initial,
    check: (current: TransferValues) => checkTransfer(current, context),
    save,
    onSaved: (body) => {
      onSaved(body.date);
    },
  });
  const from = context.paymentMethods.get(values.fromPaymentMethodId);
  const to = context.paymentMethods.get(values.toPaymentMethodId);
  const sent = fixedCurrency(from) ?? values.currency;
  const received = fixedCurrency(to) ?? sent;
  const changes = sent !== null && received !== null && sent !== received;

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
      <AmountField
        name="amount"
        label={changes ? `Monto enviado (${CURRENCY_LABELS[sent]})` : 'Monto'}
        large
        value={values.amount}
        error={errors.amount}
        onChange={(amount) => {
          set('amount', amount);
        }}
      />

      {accountSelect('fromPaymentMethodId', 'Desde')}
      {accountSelect('toPaymentMethodId', 'Hacia')}

      {from !== undefined && fixedCurrency(from) === null && (
        <CurrencyField
          value={values.currency}
          error={errors.currency}
          onChange={(currency) => {
            set('currency', currency);
          }}
        />
      )}

      {changes && (
        <AmountField
          name="receivedAmount"
          label={`Monto recibido (${CURRENCY_LABELS[received]})`}
          hint="Cópialo del voucher: el tipo de cambio nunca se calcula."
          value={values.receivedAmount}
          error={errors.receivedAmount}
          onChange={(amount) => {
            set('receivedAmount', amount);
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

      <details open={id !== null || values.description !== ''}>
        <summary className="cursor-pointer text-sm font-medium text-stone-700">
          Más detalles
        </summary>
        <div className="mt-3">
          <DescriptionField
            value={values.description}
            error={errors.description}
            proposed={
              from === undefined || to === undefined
                ? undefined
                : `Transferencia ${from.alias} → ${to.alias}`
            }
            onChange={(description) => {
              set('description', description);
            }}
          />
        </div>
      </details>

      <FormFooter error={formError} pending={pending} />
    </form>
  );
}
