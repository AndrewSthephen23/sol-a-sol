'use client';

import { Field, INPUT } from '@/features/transactions/field';

import { type InstallmentCheck, type InstallmentDraft, previewText } from './installment-model';
import { useCardStatuses } from './queries';

/** Qué se puede hacer con cuotas según el método elegido. */
export type InstallmentCard =
  | { kind: 'none' }
  /** Una tarjeta sin configurar: sin su día de corte no se sabe en qué estado va cada cuota. */
  | { kind: 'unconfigured' }
  | { kind: 'configured'; cardId: string; statementDay: number };

/**
 * La tarjeta configurada de un método de pago, si la hay. Con el flag de tarjetas apagado
 * (`enabled` en falso) no se pide nada y nunca se ofrecen cuotas.
 */
export function useInstallmentCard(
  method: { id: string; kind: string } | undefined,
  enabled: boolean,
): InstallmentCard {
  const statuses = useCardStatuses(enabled && method?.kind === 'CREDIT_CARD');
  if (!enabled || method?.kind !== 'CREDIT_CARD' || statuses.data === undefined) {
    return { kind: 'none' };
  }
  const card = statuses.data.find((entry) => entry.paymentMethod.id === method.id);

  return card === undefined
    ? { kind: 'unconfigured' }
    : { kind: 'configured', cardId: card.id, statementDay: card.statementDay };
}

interface InstallmentsFieldProps {
  card: InstallmentCard;
  draft: InstallmentDraft;
  check: InstallmentCheck;
  /** Al corregir una compra que ya se paga en cuotas: se deshace desde Tarjetas. */
  existing: string | null;
  onChange: (draft: InstallmentDraft) => void;
}

/**
 * «En cuotas» al registrar una compra con tarjeta. El reparto se ve **antes de guardar**, calculado
 * por el dominio; sin tarjeta configurada no se ofrece, y se dice por qué.
 */
export function InstallmentsField({
  card,
  draft,
  check,
  existing,
  onChange,
}: Readonly<InstallmentsFieldProps>) {
  if (card.kind === 'none') return null;
  if (card.kind === 'unconfigured') {
    return (
      <p className="text-sm text-stone-600">
        Para pagarla en cuotas, primero configura esta tarjeta en Tarjetas.
      </p>
    );
  }
  if (existing !== null) {
    return (
      <p className="text-sm text-stone-600">
        {existing}. Para cambiarlo, deshaz las cuotas desde Tarjetas.
      </p>
    );
  }

  return (
    <fieldset className="flex flex-col gap-3 text-sm">
      <legend className="sr-only">Cuotas</legend>
      <label className="flex items-center gap-2 font-medium">
        <input
          type="checkbox"
          checked={draft.enabled}
          onChange={(event) => {
            onChange({ ...draft, enabled: event.target.checked });
          }}
        />
        En cuotas
      </label>
      {draft.enabled && (
        <>
          <Field
            label="Número de cuotas"
            error={check.kind === 'error' ? check.message : undefined}
          >
            {(control) => (
              <input
                {...control}
                inputMode="numeric"
                autoComplete="off"
                placeholder="6"
                value={draft.count}
                onChange={(event) => {
                  onChange({ ...draft, count: event.target.value });
                }}
                className={INPUT}
              />
            )}
          </Field>
          <Field
            label="Total en cuotas"
            error={undefined}
            hint="Solo si el banco te cobra intereses: lo que pagarás en total."
          >
            {(control) => (
              <input
                {...control}
                inputMode="decimal"
                autoComplete="off"
                placeholder="0.00"
                value={draft.total}
                onChange={(event) => {
                  onChange({ ...draft, total: event.target.value });
                }}
                className={INPUT}
              />
            )}
          </Field>
          {check.kind === 'waiting' && (
            <p className="text-stone-600">
              Completa el monto, la moneda y la fecha para ver el reparto.
            </p>
          )}
          {check.kind === 'ready' && (
            <output className="rounded-md bg-amber-50 p-3 text-amber-900">
              {previewText(check.installments)}
            </output>
          )}
        </>
      )}
    </fieldset>
  );
}
