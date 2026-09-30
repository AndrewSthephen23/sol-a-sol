'use client';

import Link from 'next/link';
import { useMemo } from 'react';

import { cardAlerts } from './card-alerts-model';
import { useCardStatuses } from './queries';

const TONE = {
  CRITICAL: 'border-red-200 bg-red-50',
  WARNING: 'border-amber-200 bg-amber-50',
} as const;

/**
 * El bloque «Tarjetas» del dashboard (decisión 12 de H5): **solo aparece si alguna tarjeta
 * necesita atención**, y dice en texto qué pasa. Mientras carga no ocupa lugar: el resumen del mes
 * es lo principal.
 */
export function CardAlerts() {
  const statuses = useCardStatuses();
  const alerts = useMemo(() => cardAlerts(statuses.data ?? []), [statuses.data]);

  if (statuses.isError) {
    return (
      <p role="alert" className="text-sm text-stone-600">
        No se pudo revisar el estado de tus tarjetas.{' '}
        <button
          type="button"
          onClick={() => void statuses.refetch()}
          className="font-medium text-amber-700 underline"
        >
          Reintentar
        </button>
      </p>
    );
  }
  if (alerts.length === 0) return null;

  return (
    <section aria-labelledby="card-alerts" className="flex flex-col gap-2">
      <h2 id="card-alerts" className="text-lg font-semibold">
        Tarjetas
      </h2>
      <ul className="flex flex-col gap-2">
        {alerts.map((alert) => (
          <li key={alert.cardId} className={`rounded-lg border p-3 ${TONE[alert.severity]}`}>
            <Link
              href={`/credit-cards#tarjeta-${alert.cardId}`}
              className="font-semibold text-stone-900 underline"
            >
              {alert.name}
            </Link>
            <ul className="mt-1 text-sm text-stone-700">
              {alert.messages.map((message) => (
                <li key={message}>{message}</li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </section>
  );
}
