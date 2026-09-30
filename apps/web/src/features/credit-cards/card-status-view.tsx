import Link from 'next/link';

import { formatMoney } from '@/shared/format/money';

import type { CardWithStatus } from './card-alerts-model';
import { InstallmentPlans } from './installment-plans';
import {
  cycleText,
  debtText,
  dueText,
  paidText,
  utilizationBar,
  utilizationText,
} from './card-model';

const BAR_TONE = {
  OK: '[&::-moz-progress-bar]:bg-amber-500 [&::-webkit-progress-value]:bg-amber-500',
  HIGH: '[&::-moz-progress-bar]:bg-orange-500 [&::-webkit-progress-value]:bg-orange-500',
  CRITICAL: '[&::-moz-progress-bar]:bg-red-600 [&::-webkit-progress-value]:bg-red-600',
} as const;

/**
 * Dónde está una tarjeta hoy: el ciclo y lo cargado en él, lo que se debe, cuánto de la línea se
 * usa y el último estado cerrado con su fecha límite de pago. Todo se lee en texto; la barra
 * (`<progress>`, nativa y sin estilos en línea) solo lo acompaña.
 */
export function CardStatusView({ card }: Readonly<{ card: CardWithStatus }>) {
  const { status } = card;
  const { utilization, statement } = status;

  return (
    <div className="flex flex-col gap-3 text-sm">
      <div>
        <p className="font-medium">Ciclo actual</p>
        <p className="text-stone-600">{cycleText(status.cycle)}</p>
      </div>

      <ul className="flex flex-col gap-1">
        {status.currencies.map((entry) => (
          <li key={entry.currency}>
            <span className="font-semibold">{debtText(entry.debt, entry.currency)}</span>
            <span className="text-stone-600">
              {' · '}Consumo del ciclo: {formatMoney(entry.cycleCharges, entry.currency)}
              {entry.pendingInstallments !== '0.00' &&
                ` · Cuotas por facturar: ${formatMoney(entry.pendingInstallments, entry.currency)}`}
            </span>
          </li>
        ))}
      </ul>

      <div className="flex flex-col gap-1">
        <progress
          max={100}
          value={utilizationBar(utilization.percentage)}
          aria-label="Uso de la línea"
          className={`h-2 w-full overflow-hidden rounded-full [&::-moz-progress-bar]:rounded-full [&::-webkit-progress-bar]:bg-stone-100 [&::-webkit-progress-value]:rounded-full ${
            BAR_TONE[utilization.level ?? 'OK']
          }`}
        />
        <p
          className={
            utilization.level === 'CRITICAL' ? 'font-medium text-red-700' : 'text-stone-700'
          }
        >
          {utilizationText(utilization, card.creditLimit)}
        </p>
      </div>

      {statement === null ? (
        <p className="text-stone-600">Todavía no hay un estado cerrado desde tu saldo inicial.</p>
      ) : (
        <div>
          <p className="font-medium">Último estado de cuenta</p>
          <ul className="text-stone-600">
            {statement.balances.map((entry) => (
              <li key={entry.currency}>{formatMoney(entry.balance, entry.currency)}</li>
            ))}
          </ul>
          <p className="text-stone-700">{dueText(statement)}</p>
          <p className={statement.paid ? 'text-green-700' : 'font-medium text-stone-900'}>
            {paidText(statement)}
          </p>
        </div>
      )}

      <InstallmentPlans cardId={card.id} />

      <Link
        href={`/transactions?paymentMethodId=${card.paymentMethod.id}`}
        className="self-start font-medium text-amber-700 underline"
      >
        Ver movimientos de la tarjeta
      </Link>
    </div>
  );
}
