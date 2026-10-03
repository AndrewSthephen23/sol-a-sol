import type { Decimal } from 'decimal.js';

import { countPercentage, Money } from '../money/money.js';
import { type LocalDate } from '../time/local-date.js';
import { assertGoalSettings } from './goal-policy.js';

/**
 * Cuánto va una meta de ahorro y si se va a llegar, decidido con el autor el 2026-10-03
 * (`docs/modules/goals.md`). Nada se guarda: se calcula al consultar con los aportes de hoy.
 */

/**
 * «En riesgo» con el avance **más de** estos puntos por debajo del esperado (decisión 4): justo 10
 * puntos atrás todavía está en curso.
 */
export const AT_RISK_GAP_ABOVE = 10;

export type GoalContributionKind = 'CONTRIBUTION' | 'WITHDRAWAL';

export type GoalStatus = 'ON_TRACK' | 'AT_RISK' | 'ACHIEVED' | 'OVERDUE';

/**
 * Un aporte o un retiro, con monto positivo: el tipo dice si suma o resta (decisión 2). Uno
 * enlazado llega con la fecha y el monto de su transacción hoy (`linkedContribution`).
 */
export interface GoalMovement {
  readonly kind: GoalContributionKind;
  readonly amount: Money;
  readonly date: LocalDate;
}

export interface GoalProgressRequest {
  readonly target: Money;
  readonly startDate: LocalDate;
  readonly endDate: LocalDate;
  readonly contributions: readonly GoalMovement[];
  readonly today: LocalDate;
}

export interface GoalProgress {
  /** Aportes menos retiros hasta hoy. Negativo solo si se borró una transacción enlazada. */
  readonly saved: Money;
  /** Lo que falta para el objetivo; cero si ya se llegó. */
  readonly remaining: Money;
  /** Lo que pasa del objetivo; cero si no se llegó (decisión 5). */
  readonly excess: Money;
  /** Ahorrado / objetivo, sin redondear: puede pasar de 100 (decisión 5). */
  readonly percentage: Decimal;
  /**
   * Cuánto debería llevar aportando parejo, medido al cierre del mes anterior: dentro del mes hay
   * hasta fin de mes para aportar (2026-10-03). Sin redondear; 100 si la fecha fin ya pasó.
   */
  readonly expectedPercentage: Decimal;
  /**
   * Cuánto falta para ir al día: lo esperado (`expectedPercentage` del objetivo) menos lo
   * ahorrado, sin redondear; cero si se va al día o adelantado.
   */
  readonly behind: Money;
  /** Cuánto aportar cada mes para llegar; cero si ya se llegó, `null` si la fecha fin pasó. */
  readonly suggestedMonthly: Money | null;
  readonly status: GoalStatus;
}

const MONTHS_PER_YEAR = 12;
/** De porcentaje a factor: 59 (%) × 0.01 = 0.59. */
const PERCENT_TO_FACTOR = '0.01';

export function computeGoalProgress(request: GoalProgressRequest): GoalProgress {
  assertGoalSettings(request);
  const { target, endDate, today } = request;
  const saved = savedUntil(request.contributions, target.currency, today);
  const missing = target.subtract(saved);
  const remaining = missing.isPositive() ? missing : Money.zero(target.currency);
  const excess = missing.isNegative() ? missing.multiply('-1') : Money.zero(target.currency);
  const percentage = present(saved.percentageOf(target));
  const expectedPercentage = expectedPercentageAt(request);
  const overdue = today.isAfter(endDate);
  const gap = target.multiply(expectedPercentage).multiply(PERCENT_TO_FACTOR).subtract(saved);

  return {
    saved,
    remaining,
    excess,
    percentage,
    expectedPercentage,
    behind: gap.isPositive() ? gap : Money.zero(target.currency),
    suggestedMonthly: suggestedMonthly(remaining, request, overdue),
    status: statusOf(remaining, overdue, expectedPercentage.minus(percentage)),
  };
}

/** Un aporte con fecha futura todavía no cuenta; uno anterior al inicio, sí (2026-10-03). */
function savedUntil(
  contributions: readonly GoalMovement[],
  currency: Money['currency'],
  today: LocalDate,
): Money {
  return contributions
    .filter((movement) => !movement.date.isAfter(today))
    .reduce(
      (sum, movement) =>
        movement.kind === 'WITHDRAWAL' ? sum.subtract(movement.amount) : sum.add(movement.amount),
      Money.zero(currency),
    );
}

/**
 * La fracción del plazo transcurrida al último día del mes anterior, contando el día de inicio y
 * el de fin. En el primer mes, y en una meta que todavía no empieza, es cero.
 */
function expectedPercentageAt(request: GoalProgressRequest): Decimal {
  const { startDate, endDate, today } = request;
  const totalDays = startDate.daysUntil(endDate) + 1;
  const checkpoint = today.withDayOfMonth(1).plusDays(-1);
  const elapsedDays = today.isAfter(endDate)
    ? totalDays
    : Math.max(startDate.daysUntil(checkpoint) + 1, 0);
  return present(countPercentage(elapsedDays, totalDays));
}

/**
 * Lo que falta entre los meses que quedan, **contando el mes en curso** (o desde el mes de inicio,
 * si todavía no empieza), redondeado **hacia arriba** al céntimo (decisión 3): es la primera parte
 * de `allocate`, que se lleva el céntimo sobrante.
 */
function suggestedMonthly(
  remaining: Money,
  request: GoalProgressRequest,
  overdue: boolean,
): Money | null {
  if (remaining.isZero()) return remaining;
  if (overdue) return null;
  const { startDate, endDate, today } = request;
  const from = startDate.isAfter(today) ? startDate : today;
  const monthsLeft =
    (endDate.year - from.year) * MONTHS_PER_YEAR + (endDate.month - from.month) + 1;
  return present(remaining.allocate(monthsLeft)[0]);
}

function statusOf(remaining: Money, overdue: boolean, gap: Decimal): GoalStatus {
  if (remaining.isZero()) return 'ACHIEVED';
  if (overdue) return 'OVERDUE';
  return gap.greaterThan(AT_RISK_GAP_ABOVE) ? 'AT_RISK' : 'ON_TRACK';
}

/**
 * `percentageOf` y `countPercentage` solo dan `null` con base cero, y `allocate` reparte en una
 * parte o más: con una meta válida (`assertGoalSettings`: objetivo mayor que cero, fin después del
 * inicio) nunca pasa. El tipo lo exige igual.
 */
function present<T>(value: T | null | undefined): T {
  // Stryker disable all: inalcanzable con una meta válida, que es lo único que llega aquí.
  if (value === null || value === undefined) {
    throw new Error('A valid savings goal never divides by zero.');
  }
  // Stryker restore all
  return value;
}
