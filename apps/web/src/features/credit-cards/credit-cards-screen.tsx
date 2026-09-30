'use client';

import { useMemo, useState } from 'react';

import { usePaymentMethods } from '@/features/transactions/queries';

import { cardName } from './card-alerts-model';
import { CardForm } from './card-form';
import { draftFor } from './card-model';
import { CardStatusView } from './card-status-view';
import { useCardStatuses, useSaveCard } from './queries';

const NOTICE = 'rounded-lg border border-stone-200 bg-white p-6 text-center text-sm text-stone-600';
const CARD = 'flex flex-col gap-3 rounded-lg border border-stone-200 bg-white p-4';
const BUTTON =
  'rounded-md border border-stone-300 bg-white px-3 py-2 text-sm font-medium hover:bg-stone-50';

/**
 * Las tarjetas de crédito de la cuenta (decisiones 11 y 12 de H5): las configuradas con su estado,
 * y las que todavía no, con «Configura tu tarjeta». Una tarjeta es un método de pago `CREDIT_CARD`;
 * aquí se le agrega lo que el método no tiene. Una archivada se sigue viendo y corrigiendo.
 */
export function CreditCardsScreen() {
  const statuses = useCardStatuses();
  const methods = usePaymentMethods();
  const save = useSaveCard();
  // Qué formulario está abierto: el id de la tarjeta, o el del método que se configura.
  const [open, setOpen] = useState<string | null>(null);

  const cards = useMemo(() => statuses.data ?? [], [statuses.data]);
  const unconfigured = useMemo(() => {
    const configured = new Set(cards.map((card) => card.paymentMethod.id));

    return (methods.data ?? []).filter(
      (method) =>
        method.kind === 'CREDIT_CARD' && method.archivedAt === null && !configured.has(method.id),
    );
  }, [cards, methods.data]);

  const loading = statuses.isPending || methods.isPending;
  const failed = statuses.isError || methods.isError;
  const close = () => {
    setOpen(null);
  };

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-4 py-6">
      <h1 className="text-2xl font-bold tracking-tight">Tarjetas</h1>

      {loading && !failed && <output className={NOTICE}>Cargando tus tarjetas…</output>}

      {failed && (
        <div role="alert" className={NOTICE}>
          <p>No se pudieron cargar tus tarjetas.</p>
          <button
            type="button"
            onClick={() => {
              void statuses.refetch();
              void methods.refetch();
            }}
            className="mt-2 font-medium text-amber-700 underline"
          >
            Reintentar
          </button>
        </div>
      )}

      {!loading && !failed && cards.length === 0 && unconfigured.length === 0 && (
        <p className={NOTICE}>
          Todavía no tienes tarjetas de crédito. Regístrala primero como método de pago de tipo
          tarjeta.
        </p>
      )}

      {!loading &&
        !failed &&
        cards.map((card) => {
          const title = `card-${card.id}`;

          return (
            <article
              key={card.id}
              id={`tarjeta-${card.id}`}
              aria-labelledby={title}
              className={CARD}
            >
              <div className="flex items-center justify-between gap-2">
                <h2 id={title} className="font-semibold">
                  {cardName(card)}
                  {card.paymentMethod.archived && (
                    <span className="ml-2 text-sm font-normal text-stone-500">(archivada)</span>
                  )}
                </h2>
                {open !== card.id && (
                  <button
                    type="button"
                    onClick={() => {
                      setOpen(card.id);
                    }}
                    className={BUTTON}
                  >
                    Corregir
                  </button>
                )}
              </div>
              {open === card.id ? (
                <CardForm
                  initial={draftFor(card, card.paymentMethod.currency)}
                  methodCurrency={card.paymentMethod.currency}
                  save={(body) => save.mutateAsync({ cardId: card.id, body })}
                  onDone={close}
                />
              ) : (
                <CardStatusView card={card} />
              )}
            </article>
          );
        })}

      {!loading &&
        !failed &&
        unconfigured.map((method) => {
          const title = `method-${method.id}`;

          return (
            <article key={method.id} aria-labelledby={title} className={CARD}>
              <div className="flex items-center justify-between gap-2">
                <h2 id={title} className="font-semibold">
                  {cardName({
                    paymentMethod: {
                      ...method,
                      archived: false,
                    },
                  })}
                </h2>
                {open !== method.id && (
                  <button
                    type="button"
                    onClick={() => {
                      setOpen(method.id);
                    }}
                    className="rounded-md bg-amber-500 px-3 py-2 text-sm font-semibold text-white hover:bg-amber-600"
                  >
                    Configura tu tarjeta
                  </button>
                )}
              </div>
              {open === method.id ? (
                <CardForm
                  initial={draftFor(null, method.currency)}
                  methodCurrency={method.currency}
                  save={(body) => save.mutateAsync({ paymentMethodId: method.id, body })}
                  onDone={close}
                />
              ) : (
                <p className="text-sm text-stone-600">
                  Sin configurar: agrega su línea, su día de corte y su fecha límite de pago para
                  ver cuánto debes y cuándo pagar.
                </p>
              )}
            </article>
          );
        })}
    </main>
  );
}
