'use client';

import { useMemo, useState } from 'react';

import {
  checkInstallments,
  type InstallmentCheck,
  type InstallmentDraft,
  installmentErrorMessage,
  NO_INSTALLMENTS,
} from '@/features/credit-cards/installment-model';
import { InstallmentsField, useInstallmentCard } from '@/features/credit-cards/installments-field';
import { useCreateInstallmentPlan, useInstallmentPlans } from '@/features/credit-cards/queries';

import { Field, INPUT } from './field';
import { categoryGroups, lastPaymentMethod, paymentMethodOptions } from './form-options';
import {
  AmountField,
  CategoryField,
  CurrencyField,
  DateField,
  DescriptionField,
  FormFooter,
  PaymentMethodField,
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
  /** El flag de tarjetas, leído en el servidor: apagado, no se ofrecen cuotas ni se pide nada. */
  cardsEnabled?: boolean;
  /** Las cuotas que quedaron escritas si guardar el plan falló la primera vez. */
  initialInstallments?: InstallmentDraft;
  /** Por qué no se guardaron las cuotas la primera vez, para volver a intentarlo. */
  installmentsNotice?: string | null;
  /**
   * Una compra nueva se guardó pero su plan de cuotas no: ya no se puede volver a registrar (se
   * duplicaría), así que quien llama lleva a corregirla, con lo escrito y el motivo.
   */
  onInstallmentsFailed?: (
    transactionId: string,
    code: string | null,
    draft: InstallmentDraft,
  ) => void;
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
  cardsEnabled = false,
  initialInstallments = NO_INSTALLMENTS,
  installmentsNotice = null,
  onInstallmentsFailed,
}: Readonly<TransactionFormProps>) {
  const save = useSaveTransaction(id);
  const createPlan = useCreateInstallmentPlan();
  const [installments, setInstallments] = useState(initialInstallments);
  const [planError, setPlanError] = useState(installmentsNotice);

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
  // El reparto de las cuotas se calcula en cada render; al guardar se usa el de ese momento.
  let planCheck: InstallmentCheck = { kind: 'off' };
  const { values, set, errors, formError, pending, submit } = useMovementForm({
    initial,
    check: (current: TransactionValues) => checkTransaction(current, context),
    save,
    onSaved: async (body, outcome) => {
      lastPaymentMethod.write(body.paymentMethodId ?? null);
      const transactionId = id ?? outcome.id;
      if (planCheck.kind === 'ready' && card.kind === 'configured' && transactionId !== undefined) {
        const saved = await createPlan
          .mutateAsync({ cardId: card.cardId, transactionId, body: planCheck.body })
          .catch(() => ({ ok: false as const, code: null }));
        if (!saved.ok) {
          if (id === null && onInstallmentsFailed !== undefined) {
            onInstallmentsFailed(transactionId, saved.code, installments);
          } else {
            setPlanError(
              `La compra se guardó, pero sin cuotas: ${installmentErrorMessage(saved.code)}`,
            );
          }

          return;
        }
      }
      onSaved(body.date);
    },
  });
  const method =
    values.paymentMethodId === null
      ? undefined
      : context.paymentMethods.get(values.paymentMethodId);
  const methodCurrency = fixedCurrency(method);
  const card = useInstallmentCard(method, cardsEnabled);
  const plans = useInstallmentPlans(id !== null && card.kind === 'configured' ? card.cardId : null);
  const existingPlan = plans.data?.find((plan) => plan.transactionId === id);
  const existing =
    existingPlan === undefined ? null : `Se paga en ${String(existingPlan.count)} cuotas`;
  if (card.kind === 'configured' && existing === null) {
    planCheck = checkInstallments(
      installments,
      { amount: values.amount, currency: values.currency ?? methodCurrency, date: values.date },
      card.statementDay,
    );
  }
  const proposed = context.categories.get(values.categoryId)?.name;

  return (
    <form
      noValidate
      onSubmit={(event) => {
        // Las cuotas mal escritas ya se ven junto a su campo: no se guarda la compra sin ellas.
        if (planCheck.kind === 'error') {
          event.preventDefault();

          return;
        }
        setPlanError(null);
        void submit(event);
      }}
      className="flex flex-col gap-4"
    >
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

      <InstallmentsField
        card={card}
        draft={installments}
        check={planCheck}
        existing={existing}
        onChange={setInstallments}
      />
      {planError !== null && (
        <p role="alert" className="text-sm text-red-700">
          {planError}
        </p>
      )}

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
