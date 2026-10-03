import { formatPercentage } from '@sol-a-sol/domain';

import type { paths } from '@/shared/api/schema.gen';
import { type Currency, formatMoney } from '@/shared/format/money';
import { formatDayMonth } from '@/shared/time/dates';

import { readAmount } from '@/features/transactions/amount-input';

export type Goal =
  paths['/api/v1/goals']['get']['responses'][200]['content']['application/json'][number];
export type GoalBody = paths['/api/v1/goals']['post']['requestBody']['content']['application/json'];
export type GoalPatch =
  paths['/api/v1/goals/{id}']['patch']['requestBody']['content']['application/json'];
export type Contribution =
  paths['/api/v1/goals/{id}/contributions']['get']['responses'][200]['content']['application/json'][number];
export type ContributionBody =
  paths['/api/v1/goals/{id}/contributions']['post']['requestBody']['content']['application/json'];

type Errors<F extends string> = Partial<Record<F, string>>;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/u;
/** El mismo tope que la API (`GOAL_NAME_MAX_LENGTH`). */
export const GOAL_NAME_MAX_LENGTH = 60;

// --- Meta ----------------------------------------------------------------------------------------

/** La meta mientras se escribe: todo como está escrito. */
export interface GoalDraft {
  name: string;
  targetAmount: string;
  /** Sin valor por defecto: nunca se suponen soles. Fija una vez creada. */
  currency: Currency | null;
  startDate: string;
  endDate: string;
}

export type GoalField = keyof GoalDraft;

/** Lo que ya tiene la meta, o una nueva que empieza hoy. */
export function goalDraftFor(goal: Goal | null, today: string): GoalDraft {
  if (goal === null) {
    return { name: '', targetAmount: '', currency: null, startDate: today, endDate: '' };
  }

  return {
    name: goal.name,
    targetAmount: goal.targetAmount,
    currency: goal.currency,
    startDate: goal.startDate,
    endDate: goal.endDate,
  };
}

/**
 * Revisa la meta y arma el cuerpo para la API. Los mismos límites que el dominio, para decirlo
 * junto al campo antes de mandar nada; la API vuelve a revisarlo todo.
 */
export function checkGoalDraft(
  draft: GoalDraft,
): { body: GoalBody } | { errors: Errors<GoalField> } {
  const errors: Errors<GoalField> = {};
  const name = draft.name.trim();
  if (name === '') errors.name = 'Ponle un nombre a la meta.';
  else if (name.length > GOAL_NAME_MAX_LENGTH) {
    errors.name = `El nombre tiene más de ${String(GOAL_NAME_MAX_LENGTH)} letras.`;
  }
  if (draft.currency === null) errors.currency = 'Elige la moneda de la meta.';
  const target = readAmount(draft.targetAmount, draft.currency);
  if ('error' in target) errors.targetAmount = target.error;
  if (!ISO_DATE.test(draft.startDate)) errors.startDate = 'Elige desde cuándo ahorras.';
  if (!ISO_DATE.test(draft.endDate)) errors.endDate = 'Elige para cuándo quieres llegar.';
  else if (ISO_DATE.test(draft.startDate) && draft.endDate <= draft.startDate) {
    errors.endDate = 'La fecha final va después del inicio.';
  }

  if (Object.keys(errors).length > 0 || 'error' in target || draft.currency === null) {
    return { errors };
  }

  return {
    body: {
      name,
      currency: draft.currency,
      targetAmount: target.amount,
      startDate: draft.startDate,
      endDate: draft.endDate,
    },
  };
}

/** Al corregir no viaja la moneda: queda fija desde que se crea. */
export function goalPatchOf(body: GoalBody): GoalPatch {
  return {
    name: body.name,
    targetAmount: body.targetAmount,
    startDate: body.startDate,
    endDate: body.endDate,
  };
}

// --- Aportes -------------------------------------------------------------------------------------

export interface ContributionDraft {
  source: 'MANUAL' | 'TRANSACTION';
  kind: 'CONTRIBUTION' | 'WITHDRAWAL';
  amount: string;
  date: string;
  transactionId: string;
}

export type ContributionField = 'amount' | 'date' | 'transactionId';

export function emptyContribution(today: string): ContributionDraft {
  return { source: 'MANUAL', kind: 'CONTRIBUTION', amount: '', date: today, transactionId: '' };
}

/** Un aporte o retiro a mano, en la moneda de la meta y hasta hoy; o una transacción elegida. */
export function checkContributionDraft(
  draft: ContributionDraft,
  currency: Currency,
  today: string,
): { body: ContributionBody } | { errors: Errors<ContributionField> } {
  if (draft.source === 'TRANSACTION') {
    return draft.transactionId === ''
      ? { errors: { transactionId: 'Elige la transacción de ahorro.' } }
      : { body: { source: 'TRANSACTION', transactionId: draft.transactionId } };
  }
  const errors: Errors<ContributionField> = {};
  const amount = readAmount(draft.amount, currency);
  if ('error' in amount) errors.amount = amount.error;
  if (!ISO_DATE.test(draft.date)) errors.date = 'Elige la fecha.';
  else if (draft.date > today) errors.date = 'La fecha no puede ser posterior a hoy.';

  if (Object.keys(errors).length > 0 || 'error' in amount) return { errors };

  return { body: { source: 'MANUAL', kind: draft.kind, amount: amount.amount, date: draft.date } };
}

/** El aporte otra vez, para «Deshacer» después de quitarlo. `null` si ya no se puede rehacer. */
export function contributionBodyOf(contribution: Contribution): ContributionBody | null {
  if (contribution.source === 'TRANSACTION') {
    return contribution.transaction === null
      ? null
      : { source: 'TRANSACTION', transactionId: contribution.transaction.id };
  }
  if (contribution.amount === null || contribution.date === null) return null;

  return {
    source: 'MANUAL',
    kind: contribution.kind,
    amount: contribution.amount,
    date: contribution.date,
  };
}

// --- Errores de la API ---------------------------------------------------------------------------

interface Placed<F extends string> {
  field: F | null;
  message: string;
}

const GOAL_ERRORS: Readonly<Record<string, Placed<GoalField>>> = {
  GOAL_NAME_TAKEN: {
    field: 'name',
    message: 'Ya tienes una meta con ese nombre (quizá archivada).',
  },
  GOAL_TARGET_NOT_POSITIVE: {
    field: 'targetAmount',
    message: 'El objetivo tiene que ser mayor que cero.',
  },
  INVALID_AMOUNT: { field: 'targetAmount', message: 'El monto tiene más de 2 decimales.' },
  GOAL_END_NOT_AFTER_START: { field: 'endDate', message: 'La fecha final va después del inicio.' },
  INVALID_LOCAL_DATE: { field: 'endDate', message: 'Esa fecha no existe.' },
  GOAL_NOT_FOUND: { field: null, message: 'Esa meta ya no existe.' },
};

const CONTRIBUTION_ERRORS: Readonly<Record<string, Placed<ContributionField>>> = {
  GOAL_CONTRIBUTION_AMOUNT_NOT_POSITIVE: {
    field: 'amount',
    message: 'El monto tiene que ser mayor que cero.',
  },
  INVALID_AMOUNT: { field: 'amount', message: 'El monto tiene más de 2 decimales.' },
  GOAL_WITHDRAWAL_EXCEEDS_SAVED: {
    field: 'amount',
    message: 'No puedes retirar más de lo que llevas ahorrado.',
  },
  GOAL_CONTRIBUTION_DATE_IN_FUTURE: {
    field: 'date',
    message: 'La fecha no puede ser posterior a hoy.',
  },
  INVALID_LOCAL_DATE: { field: 'date', message: 'Esa fecha no existe.' },
  GOAL_TRANSACTION_NOT_A_SAVING: {
    field: 'transactionId',
    message: 'Solo se enlaza una transacción de ahorro o de inversión.',
  },
  GOAL_CURRENCY_MISMATCH: {
    field: 'transactionId',
    message: 'La transacción está en otra moneda que la meta.',
  },
  GOAL_TRANSACTION_ALREADY_LINKED: {
    field: 'transactionId',
    message: 'Esa transacción ya aporta a una meta.',
  },
  TRANSACTION_NOT_FOUND: { field: 'transactionId', message: 'Esa transacción ya no existe.' },
  GOAL_ARCHIVED: {
    field: null,
    message: 'La meta está archivada: desarchívala para aportarle.',
  },
  GOAL_NOT_FOUND: { field: null, message: 'Esa meta ya no existe.' },
};

export function goalApiError(code: string | null): Placed<GoalField> | null {
  return code === null ? null : (GOAL_ERRORS[code] ?? null);
}

export function contributionApiError(code: string | null): Placed<ContributionField> | null {
  return code === null ? null : (CONTRIBUTION_ERRORS[code] ?? null);
}

/** Quitar un aporte que dejaría la meta en negativo, en palabras. */
export function removeErrorText(code: string | null): string {
  return code === 'GOAL_WITHDRAWAL_EXCEEDS_SAVED'
    ? 'No se puede quitar: tus retiros sacarían más de lo que quedaría ahorrado.'
    : 'No se pudo quitar el aporte. Inténtalo de nuevo.';
}

// --- Cómo va -------------------------------------------------------------------------------------

/** «Llevas S/ 300.00 de S/ 1,200.00 (25.00 %)». */
export function savedText(goal: Goal): string {
  return `Llevas ${formatMoney(goal.progress.saved, goal.currency)} de ${formatMoney(
    goal.targetAmount,
    goal.currency,
  )} (${formatPercentage(goal.progress.percentage)} %)`;
}

/** Lo que falta, o cuánto se pasó de la meta. */
export function remainingText(goal: Goal): string {
  const { excess, remaining } = goal.progress;
  if (excess !== '0.00') return `Superaste la meta por ${formatMoney(excess, goal.currency)}`;
  if (remaining === '0.00') return 'Llegaste a la meta';

  return `Te faltan ${formatMoney(remaining, goal.currency)}`;
}

/** El estado en palabras: la barra solo lo acompaña. */
export function statusText(goal: Goal): string {
  switch (goal.progress.status) {
    case 'ACHIEVED':
      return '¡Cumplida!';
    case 'OVERDUE':
      return `Vencida: faltaron ${formatMoney(goal.progress.remaining, goal.currency)}`;
    case 'AT_RISK':
      return `En riesgo: te faltan ${formatMoney(goal.progress.behind, goal.currency)} para ir al día`;
    default:
      return 'Vas bien';
  }
}

/** Cuánto aportar al mes; nada que decir si ya llegaste. */
export function suggestedText(goal: Goal): string | null {
  const { suggestedMonthly } = goal.progress;
  if (suggestedMonthly === null) return 'La fecha final ya pasó: no hay aporte sugerido.';
  if (suggestedMonthly === '0.00') return null;

  return `Aporta ${formatMoney(suggestedMonthly, goal.currency)} al mes para llegar a tiempo`;
}

/** «Del 1 de enero de 2026 al 31 de diciembre de 2026». */
export function periodText(goal: Goal): string {
  const day = (date: string) => `${formatDayMonth(date)} de ${date.slice(0, 4)}`;

  return `Del ${day(goal.startDate)} al ${day(goal.endDate)}`;
}

/**
 * Qué tan llena va la barra, de 0 a 100. **Solo para dibujar**: el número nunca se muestra ni se
 * usa para calcular (eso va en texto, con `savedText`).
 */
export function progressBar(percentage: string): number {
  return Math.max(0, Math.min(100, Number(percentage)));
}

const STATE_TEXT: Readonly<Record<string, string>> = {
  TRANSACTION_DELETED: 'No cuenta: la transacción se borró',
  TRANSACTION_NOT_A_SAVING: 'No cuenta: la transacción ya no es de ahorro',
  CURRENCY_MISMATCH: 'No cuenta: la transacción está en otra moneda',
};

/** «Aporte de S/ 300.00 el 15 de setiembre», con la transacción si es enlazado. */
export function contributionText(contribution: Contribution, currency: Currency): string {
  const what = contribution.kind === 'WITHDRAWAL' ? 'Retiro' : 'Aporte';
  const amount =
    contribution.amount === null ? '' : ` de ${formatMoney(contribution.amount, currency)}`;
  const when = contribution.date === null ? '' : ` el ${formatDayMonth(contribution.date)}`;
  const from =
    contribution.transaction === null ? '' : ` · ${contribution.transaction.description}`;

  return `${what}${amount}${when}${from}`;
}

/** Por qué un aporte enlazado no cuenta; `null` si cuenta. */
export function contributionStateText(contribution: Contribution): string | null {
  return STATE_TEXT[contribution.state] ?? null;
}
