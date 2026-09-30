import { formatPercentage } from '@sol-a-sol/domain';

import type { paths } from '@/shared/api/schema.gen';
import { formatMoney } from '@/shared/format/money';
import { formatDay } from '@/shared/time/dates';

export type CardWithStatus =
  paths['/api/v1/credit-cards/status']['get']['responses'][200]['content']['application/json'][number];

/** Una tarjeta que necesita atención, con cada motivo escrito: nunca solo un color. */
export interface CardAlert {
  cardId: string;
  /** «Visa BCP •••• 4321». */
  name: string;
  /** La más grave manda el color del aviso. */
  severity: 'CRITICAL' | 'WARNING';
  messages: string[];
}

/** Alias, banco y últimos 4: lo único que identifica una tarjeta. */
export function cardName(card: Pick<CardWithStatus, 'paymentMethod'>): string {
  const { alias, institution, last4 } = card.paymentMethod;
  const bank = institution === null || alias.includes(institution) ? '' : ` ${institution}`;

  return `${alias}${bank}${last4 === null ? '' : ` •••• ${last4}`}`;
}

/** 0 → «hoy», 1 → «mañana», 3 → «en 3 días». */
function whenText(daysLeft: number): string {
  if (daysLeft === 0) return 'hoy';
  if (daysLeft === 1) return 'mañana';
  return `en ${String(daysLeft)} días`;
}

/** Lo que falta pagar del estado, en cada moneda en que falta: «S/ 45.00 y US$ 20.00». */
function remainingText(card: CardWithStatus): string {
  return (card.status.statement?.balances ?? [])
    .filter((entry) => entry.remaining !== '0.00')
    .map((entry) => formatMoney(entry.remaining, entry.currency))
    .join(' y ');
}

/**
 * Qué tarjetas avisar en el dashboard y por qué (decisión 12 de H5): utilización alta o crítica, o
 * un pago que vence pronto o ya venció. El nivel y los días vienen de la API, que los calcula con
 * el dominio: aquí solo se escriben. **Una tarjeta archivada no avisa** (2026-09-29).
 */
export function cardAlerts(cards: readonly CardWithStatus[]): CardAlert[] {
  return cards.flatMap((card) => {
    if (card.paymentMethod.archived) return [];
    const { utilization, paymentAlert, statement } = card.status;
    const messages: string[] = [];

    if (utilization.level === 'HIGH' || utilization.level === 'CRITICAL') {
      const used = `Usas el ${formatPercentage(utilization.percentage ?? '0')} % de la línea`;
      messages.push(utilization.level === 'CRITICAL' ? `${used}: nivel crítico` : used);
    }
    if (paymentAlert !== null && statement !== null) {
      const day = formatDay(statement.dueDate);
      messages.push(
        paymentAlert.status === 'OVERDUE'
          ? `El pago venció el ${day}: falta pagar ${remainingText(card)}`
          : `Pagas ${remainingText(card)} el ${day}, ${whenText(paymentAlert.daysLeft)}`,
      );
    }
    if (messages.length === 0) return [];

    const critical = utilization.level === 'CRITICAL' || paymentAlert?.status === 'OVERDUE';

    return [
      {
        cardId: card.id,
        name: cardName(card),
        severity: critical ? ('CRITICAL' as const) : ('WARNING' as const),
        messages,
      },
    ];
  });
}
