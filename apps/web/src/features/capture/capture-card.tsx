'use client';

import { useState } from 'react';

import { NETWORK_ERROR } from '@/shared/api/problem';
import { useUndoNotice } from '@/shared/feedback/undo-toast';
import { formatMoney } from '@/shared/format/money';

import { categoriesById, paymentMethodLabel, TYPE_LABELS } from '@/features/transactions/labels';
import type { Category, PaymentMethod } from '@/features/transactions/queries';

import {
  type Capture,
  captureErrorMessage,
  missingLabel,
  missingToConfirm,
  warningLabel,
} from './capture-model';
import { CorrectionForm } from './correction-form';
import { useConfirmCapture, useDiscardCapture } from './queries';

interface CaptureCardProps {
  capture: Capture;
  categories: readonly Category[];
  paymentMethods: readonly PaymentMethod[];
  today: string;
}

const SECONDARY =
  'rounded-md border border-stone-300 px-3 py-2 text-sm font-medium text-stone-700 hover:bg-stone-100 disabled:opacity-50';

/** «S/ 25.90», «25.90 (sin moneda)» o «Sin monto». */
function amountLabel(capture: Capture): string {
  if (capture.amount === null) return 'Sin monto';
  if (capture.currency === null) return `${capture.amount} (sin moneda)`;
  return formatMoney(capture.amount, capture.currency);
}

/**
 * Una captura de la bandeja: lo que se entendió, sus avisos en palabras y el texto que llegó del
 * teléfono, completo mientras no se confirme (decisión 14). Se confirma con un toque si está
 * completa, se corrige aquí mismo, o se descarta con «Deshacer» (decisión 11).
 */
export function CaptureCard({
  capture,
  categories,
  paymentMethods,
  today,
}: Readonly<CaptureCardProps>) {
  const [editing, setEditing] = useState(false);
  const [remember, setRemember] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const confirm = useConfirmCapture();
  const discard = useDiscardCapture();
  const showUndo = useUndoNotice();

  const category =
    capture.categoryId === null ? undefined : categoriesById(categories).get(capture.categoryId);
  const method = paymentMethods.find(({ id }) => id === capture.paymentMethodId);
  const missing = missingToConfirm(capture);
  const discarded = capture.status === 'DISCARDED';
  const busy = confirm.isPending || discard.isPending;

  async function run(action: () => Promise<{ ok: boolean; code?: string | null }>) {
    setError(null);
    try {
      const outcome = await action();
      if (!outcome.ok) setError(captureErrorMessage(outcome.code ?? null));
      return outcome.ok;
    } catch {
      setError(NETWORK_ERROR);
      return false;
    }
  }

  async function onDiscard() {
    const done = await run(() => discard.mutateAsync({ id: capture.id, action: 'discard' }));
    if (!done) return;
    showUndo({
      message: 'Captura descartada.',
      undo: async () => {
        const restored = await discard.mutateAsync({ id: capture.id, action: 'restore' });
        return restored.ok;
      },
    });
  }

  function actions() {
    if (editing) {
      return (
        <CorrectionForm
          capture={capture}
          categories={categories}
          paymentMethods={paymentMethods}
          today={today}
          onDone={() => {
            setEditing(false);
          }}
        />
      );
    }
    if (discarded) {
      return (
        <button
          type="button"
          disabled={busy}
          onClick={() => void run(() => discard.mutateAsync({ id: capture.id, action: 'restore' }))}
          className={SECONDARY}
        >
          Restaurar
        </button>
      );
    }
    return (
      <div className="flex flex-col gap-3">
        {missing.length > 0 && <p className="text-sm text-stone-600">{missingLabel(missing)}</p>}
        {missing.length === 0 && capture.merchant !== null && (
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={remember}
              onChange={(event) => {
                setRemember(event.target.checked);
              }}
            />
            Recordar la categoría para «{capture.merchant}»
          </label>
        )}
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={busy || missing.length > 0}
            onClick={() =>
              void run(() => confirm.mutateAsync({ id: capture.id, rememberCategory: remember }))
            }
            className="rounded-md bg-amber-500 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-600 disabled:opacity-50"
          >
            Confirmar
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              setEditing(true);
            }}
            className={SECONDARY}
          >
            Corregir
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void onDiscard()}
            className={SECONDARY}
          >
            Descartar
          </button>
        </div>
      </div>
    );
  }

  return (
    <article
      aria-label={`${amountLabel(capture)} ${capture.merchant ?? ''}`.trim()}
      className="flex flex-col gap-3 rounded-lg border border-stone-200 bg-white p-4"
    >
      <header className="flex items-start justify-between gap-2">
        <div>
          <p className="text-lg font-semibold">{amountLabel(capture)}</p>
          <p className="text-sm text-stone-600">
            {capture.merchant ?? 'Sin comercio'} · {capture.date}
            {capture.cardLast4 === null ? '' : ` · ···· ${capture.cardLast4}`}
          </p>
        </div>
        <div className="flex flex-col items-end gap-1 text-xs">
          {capture.status === 'DUPLICATE' && (
            <span className="rounded bg-amber-100 px-2 py-1 font-medium text-amber-800">
              Posible duplicado
            </span>
          )}
          {capture.type !== 'VARIABLE_EXPENSE' && (
            <span className="rounded bg-stone-100 px-2 py-1 text-stone-700">
              {TYPE_LABELS[capture.type]}
            </span>
          )}
        </div>
      </header>

      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
        <dt className="text-stone-500">Categoría</dt>
        <dd>{category?.name ?? 'Sin categoría'}</dd>
        <dt className="text-stone-500">Método</dt>
        <dd>{method === undefined ? 'Sin método' : paymentMethodLabel(method)}</dd>
        {capture.description !== null && (
          <>
            <dt className="text-stone-500">Descripción</dt>
            <dd>{capture.description}</dd>
          </>
        )}
      </dl>

      {capture.warnings.length > 0 && (
        <ul className="list-disc pl-5 text-sm text-amber-800">
          {capture.warnings.map((code) => (
            <li key={code}>{warningLabel(code)}</li>
          ))}
        </ul>
      )}

      {capture.raw !== null && (
        <details className="text-sm">
          <summary className="cursor-pointer text-stone-600">Lo que llegó del teléfono</summary>
          <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 break-words text-stone-700">
            {Object.entries(capture.raw).map(([field, value]) => (
              <div key={field} className="contents">
                <dt className="text-stone-500">{field}</dt>
                <dd className="whitespace-pre-wrap">{value}</dd>
              </div>
            ))}
          </dl>
        </details>
      )}

      {error !== null && (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}

      {actions()}
    </article>
  );
}
