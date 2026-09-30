import { formatPercentage, parseAmount } from '@sol-a-sol/domain';

import type { paths } from '@/shared/api/schema.gen';
import { type Currency, formatMoney } from '@/shared/format/money';
import { formatDay, formatDayMonth } from '@/shared/time/dates';

import type { CardWithStatus } from './card-alerts-model';

export type CardBody = Omit<
  paths['/api/v1/credit-cards']['post']['requestBody']['content']['application/json'],
  'paymentMethodId'
>;
type CardStatus = CardWithStatus['status'];

export const CURRENCY_SYMBOLS: Readonly<Record<Currency, string>> = { PEN: 'S/', USD: 'US$' };
const CURRENCY_NAMES: Readonly<Record<Currency, string>> = { PEN: 'soles', USD: 'dólares' };

// --- Formulario ----------------------------------------------------------------------------------

/** La tarjeta mientras se configura: todo como está escrito. */
export interface CardDraft {
  creditLimit: string;
  creditLimitCurrency: Currency;
  statementDay: string;
  rule: 'DAYS_AFTER_STATEMENT' | 'DAY_OF_MONTH';
  /** Los días después del corte, o el día del mes, según `rule`. */
  ruleValue: string;
  hasOpeningBalance: boolean;
  openingDate: string;
  openingPen: string;
  openingUsd: string;
}

export type CardField = 'creditLimit' | 'statementDay' | 'ruleValue' | 'openingBalance';

/** Las monedas que acepta el método: una sola, o las dos si es bimoneda. */
export function acceptedCurrencies(methodCurrency: Currency | null): Currency[] {
  return methodCurrency === null ? ['PEN', 'USD'] : [methodCurrency];
}

/** Lo que ya está configurado, o un borrador vacío en la moneda de la tarjeta (soles si es bimoneda). */
export function draftFor(card: CardWithStatus | null, methodCurrency: Currency | null): CardDraft {
  if (card === null) {
    return {
      creditLimit: '',
      creditLimitCurrency: methodCurrency ?? 'PEN',
      statementDay: '',
      rule: 'DAYS_AFTER_STATEMENT',
      ruleValue: '',
      hasOpeningBalance: false,
      openingDate: '',
      openingPen: '',
      openingUsd: '',
    };
  }
  const rule = card.paymentDueRule;
  const opening = card.openingBalance;
  const openingIn = (currency: Currency) =>
    opening?.amounts.find((amount) => amount.currency === currency)?.amount ?? '';

  return {
    creditLimit: card.creditLimit.amount,
    creditLimitCurrency: card.creditLimit.currency,
    statementDay: String(card.statementDay),
    rule: rule.kind,
    ruleValue: String(rule.kind === 'DAYS_AFTER_STATEMENT' ? rule.days : rule.day),
    hasOpeningBalance: opening !== null,
    openingDate: opening?.date ?? '',
    openingPen: openingIn('PEN'),
    openingUsd: openingIn('USD'),
  };
}

/** Un monto de cero o más en esa moneda, con las reglas del dominio (`parseAmount`). */
function readAmount(text: string, currency: Currency): { amount: string } | { error: string } {
  let money;
  try {
    money = parseAmount(text, { defaultCurrency: currency });
  } catch {
    return { error: 'Escribe el monto con punto decimal y hasta 2 decimales, como 5000.00.' };
  }
  if (money.currency !== currency) {
    return {
      error: `El monto está en ${CURRENCY_NAMES[money.currency]}, no en ${CURRENCY_NAMES[currency]}.`,
    };
  }
  if (money.isNegative()) return { error: 'El monto no puede ser negativo.' };

  return { amount: money.toFixed() };
}

/** Un entero entre `min` y `max`, o `null`. */
function readInteger(text: string, min: number, max: number): number | null {
  if (!/^\d{1,2}$/u.test(text.trim())) return null;
  const value = Number(text.trim());

  return value >= min && value <= max ? value : null;
}

/**
 * Revisa el borrador y arma el cuerpo para la API. Los mismos límites que el dominio, para decirlo
 * junto al campo antes de mandar nada; la API vuelve a revisarlo todo.
 */
export function checkCardDraft(
  draft: CardDraft,
  accepted: readonly Currency[],
): { body: CardBody } | { errors: Partial<Record<CardField, string>> } {
  const errors: Partial<Record<CardField, string>> = {};

  const limit =
    draft.creditLimit.trim() === ''
      ? { error: 'Escribe la línea de crédito (0 si usas la de otra tarjeta).' }
      : readAmount(draft.creditLimit, draft.creditLimitCurrency);
  if ('error' in limit) errors.creditLimit = limit.error;

  const statementDay = readInteger(draft.statementDay, 1, 31);
  if (statementDay === null) errors.statementDay = 'El día de corte va del 1 al 31.';

  const ruleValue =
    draft.rule === 'DAYS_AFTER_STATEMENT'
      ? readInteger(draft.ruleValue, 1, 60)
      : readInteger(draft.ruleValue, 1, 31);
  if (ruleValue === null) {
    errors.ruleValue =
      draft.rule === 'DAYS_AFTER_STATEMENT'
        ? 'Los días después del corte van del 1 al 60.'
        : 'El día de pago va del 1 al 31.';
  }

  const amounts: { amount: string; currency: Currency }[] = [];
  if (draft.hasOpeningBalance) {
    const typed = accepted
      .map((currency) => ({
        currency,
        text: currency === 'PEN' ? draft.openingPen : draft.openingUsd,
      }))
      .filter((entry) => entry.text.trim() !== '');
    for (const entry of typed) {
      const read = readAmount(entry.text, entry.currency);
      if ('error' in read) errors.openingBalance = read.error;
      else amounts.push({ amount: read.amount, currency: entry.currency });
    }
    if (typed.length === 0)
      errors.openingBalance = 'Escribe cuánto debías, en al menos una moneda.';
    else if (!/^\d{4}-\d{2}-\d{2}$/u.test(draft.openingDate)) {
      errors.openingBalance = 'Elige desde qué fecha debías ese monto.';
    }
  }

  if (
    Object.keys(errors).length > 0 ||
    'error' in limit ||
    statementDay === null ||
    ruleValue === null
  ) {
    return { errors };
  }

  return {
    body: {
      creditLimit: { amount: limit.amount, currency: draft.creditLimitCurrency },
      statementDay,
      paymentDueRule:
        draft.rule === 'DAYS_AFTER_STATEMENT'
          ? { kind: 'DAYS_AFTER_STATEMENT', days: ruleValue }
          : { kind: 'DAY_OF_MONTH', day: ruleValue },
      openingBalance: draft.hasOpeningBalance ? { date: draft.openingDate, amounts } : null,
    },
  };
}

/** Errores de la API de tarjetas, en español, con el campo al que corresponden. */
const API_ERRORS: Readonly<Record<string, { field: CardField | null; message: string }>> = {
  CREDIT_LIMIT_NEGATIVE: { field: 'creditLimit', message: 'La línea no puede ser negativa.' },
  CREDIT_CARD_CURRENCY_NOT_ACCEPTED: {
    field: 'creditLimit',
    message: 'La tarjeta no acepta esa moneda.',
  },
  INVALID_AMOUNT: { field: 'creditLimit', message: 'Un monto tiene más de 2 decimales.' },
  STATEMENT_DAY_INVALID: { field: 'statementDay', message: 'El día de corte va del 1 al 31.' },
  PAYMENT_DUE_RULE_INVALID: {
    field: 'ruleValue',
    message: 'Revisa la fecha de pago: de 1 a 60 días, o un día del 1 al 31.',
  },
  OPENING_BALANCE_EMPTY: {
    field: 'openingBalance',
    message: 'Escribe cuánto debías, en al menos una moneda.',
  },
  OPENING_BALANCE_NEGATIVE: {
    field: 'openingBalance',
    message: 'El saldo inicial no puede ser negativo.',
  },
  OPENING_BALANCE_CURRENCY_REPEATED: {
    field: 'openingBalance',
    message: 'Hay dos saldos en la misma moneda.',
  },
  OPENING_BALANCE_DATE_IN_FUTURE: {
    field: 'openingBalance',
    message: 'La fecha del saldo inicial no puede ser posterior a hoy.',
  },
  INVALID_LOCAL_DATE: { field: 'openingBalance', message: 'Esa fecha no existe.' },
  PAYMENT_METHOD_NOT_CREDIT_CARD: {
    field: null,
    message: 'Ese método de pago no es una tarjeta de crédito.',
  },
  PAYMENT_METHOD_ARCHIVED: {
    field: null,
    message: 'La tarjeta está archivada: restáurala para configurarla.',
  },
  PAYMENT_METHOD_NOT_FOUND: { field: null, message: 'Esa tarjeta ya no existe.' },
  CREDIT_CARD_NOT_FOUND: { field: null, message: 'Esa tarjeta ya no existe.' },
  CREDIT_CARD_ALREADY_CONFIGURED: {
    field: null,
    message: 'Esta tarjeta ya estaba configurada: recarga la página para corregirla.',
  },
};

export function cardApiError(
  code: string | null,
): { field: CardField | null; message: string } | null {
  return code === null ? null : (API_ERRORS[code] ?? null);
}

// --- Estado --------------------------------------------------------------------------------------

/** «Del 21 de setiembre al 20 de octubre». */
export function cycleText(cycle: CardStatus['cycle']): string {
  return `Del ${formatDayMonth(cycle.start)} al ${formatDayMonth(cycle.end)}`;
}

/** Lo que se debe, o el saldo a favor si pagaste de más. */
export function debtText(amount: string, currency: Currency): string {
  return amount.startsWith('-')
    ? `Saldo a favor: ${formatMoney(amount.slice(1), currency)}`
    : `Debes ${formatMoney(amount, currency)}`;
}

const LEVEL_TEXT = { OK: '', HIGH: ': uso alto', CRITICAL: ': uso crítico' } as const;

/** Cuánto de la línea se usa, en texto; la barra solo lo acompaña. Sin línea no hay porcentaje. */
export function utilizationText(
  utilization: CardStatus['utilization'],
  creditLimit: CardWithStatus['creditLimit'],
): string {
  if (utilization.percentage === null || utilization.level === null) {
    return 'Sin línea propia: no hay porcentaje de uso (—).';
  }

  return `Usas el ${formatPercentage(utilization.percentage)} % de tu línea de ${formatMoney(
    creditLimit.amount,
    creditLimit.currency,
  )}${LEVEL_TEXT[utilization.level]}`;
}

/** 0 → «hoy», 1 → «mañana», 3 → «en 3 días», -1 → «venció ayer», -4 → «venció hace 4 días». */
export function daysLeftText(daysLeft: number): string {
  if (daysLeft === 0) return 'hoy';
  if (daysLeft === 1) return 'mañana';
  if (daysLeft > 1) return `en ${String(daysLeft)} días`;
  if (daysLeft === -1) return 'venció ayer';
  return `venció hace ${String(-daysLeft)} días`;
}

/** «Fecha límite de pago: jueves, 15 de octubre (en 16 días)». Nunca «vencimiento»: ese es el plástico. */
export function dueText(statement: NonNullable<CardStatus['statement']>): string {
  return `Fecha límite de pago: ${formatDay(statement.dueDate)} (${daysLeftText(statement.daysLeft)})`;
}

/** «Pagado», o cuánto falta en cada moneda que falta: «Falta pagar S/ 45.00 y US$ 20.00». */
export function paidText(statement: NonNullable<CardStatus['statement']>): string {
  if (statement.paid) return 'Pagado';
  const left = statement.balances
    .filter((entry) => entry.remaining !== '0.00')
    .map((entry) => formatMoney(entry.remaining, entry.currency));

  return `Falta pagar ${left.join(' y ')}`;
}

/**
 * Qué tan llena va la barra de la línea, de 0 a 100. **Solo para dibujar**: el número nunca se
 * muestra ni se usa para calcular (eso va en texto, con `utilizationText`).
 */
export function utilizationBar(percentage: string | null): number {
  if (percentage === null) return 0;

  return Math.max(0, Math.min(100, Number(percentage)));
}
