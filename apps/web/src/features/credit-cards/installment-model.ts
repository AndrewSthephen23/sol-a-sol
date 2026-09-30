import {
  computeInstallmentPlan,
  type Installment,
  LocalDate,
  MAX_INSTALLMENTS,
  MIN_INSTALLMENTS,
  Money,
  parseAmount,
} from '@sol-a-sol/domain';

import type { paths } from '@/shared/api/schema.gen';
import { type Currency, formatMoney } from '@/shared/format/money';
import { formatDayMonth } from '@/shared/time/dates';

export type InstallmentPlan =
  paths['/api/v1/credit-cards/{id}/installments']['get']['responses'][200]['content']['application/json'][number];
export type InstallmentPlanBody = Omit<
  paths['/api/v1/credit-cards/{id}/installments']['post']['requestBody']['content']['application/json'],
  'transactionId'
>;

/** «En cuotas» mientras se escribe: el número y, si hay intereses, el total que da el banco. */
export interface InstallmentDraft {
  enabled: boolean;
  count: string;
  /** Vacío = sin intereses: se paga el monto de la compra. */
  total: string;
}

export const NO_INSTALLMENTS: InstallmentDraft = { enabled: false, count: '', total: '' };

/** La compra como está escrita en el formulario. */
export interface PurchaseDraft {
  amount: string;
  currency: Currency | null;
  date: string;
}

export type InstallmentCheck =
  | { kind: 'off' }
  /** Todavía falta la compra (monto, moneda o fecha) para calcular el reparto: no es un error. */
  | { kind: 'waiting' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; body: InstallmentPlanBody; installments: Installment[] };

function money(text: string, currency: Currency): Money | null {
  try {
    const parsed = parseAmount(text, { defaultCurrency: currency });

    return parsed.currency === currency ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * Revisa las cuotas y calcula el reparto **con el dominio** (`computeInstallmentPlan`: `allocate`,
 * los céntimos sobrantes a las primeras): la web nunca divide. Se revisa antes de guardar la
 * compra, para que el plan casi nunca falle después.
 */
export function checkInstallments(
  draft: InstallmentDraft,
  purchase: PurchaseDraft,
  statementDay: number,
): InstallmentCheck {
  if (!draft.enabled) return { kind: 'off' };
  const count = /^\d{1,2}$/u.test(draft.count.trim()) ? Number(draft.count.trim()) : null;
  if (count === null || count < MIN_INSTALLMENTS || count > MAX_INSTALLMENTS) {
    return {
      kind: 'error',
      message: `Las cuotas van de ${String(MIN_INSTALLMENTS)} a ${String(MAX_INSTALLMENTS)}.`,
    };
  }
  const { currency } = purchase;
  if (currency === null || !/^\d{4}-\d{2}-\d{2}$/u.test(purchase.date)) return { kind: 'waiting' };
  const price = money(purchase.amount, currency);
  if (!price?.isPositive()) return { kind: 'waiting' };

  let total = price;
  if (draft.total.trim() !== '') {
    const bank = money(draft.total, currency);
    if (bank === null) {
      return { kind: 'error', message: 'Escribe el total con punto decimal y hasta 2 decimales.' };
    }
    if (bank.subtract(price).isNegative()) {
      return { kind: 'error', message: 'El total en cuotas no puede ser menor que el precio.' };
    }
    total = bank;
  }

  let installments: Installment[];
  try {
    installments = computeInstallmentPlan({
      total,
      count,
      statementDay,
      purchaseDate: LocalDate.parse(purchase.date),
    });
  } catch {
    return { kind: 'error', message: 'El monto es muy pequeño para tantas cuotas.' };
  }

  return {
    kind: 'ready',
    body: { count, totalAmount: draft.total.trim() === '' ? null : total.toFixed() },
    installments,
  };
}

/**
 * «3 cuotas: 1 de S/ 33.34 y 2 de S/ 33.33. La primera va en el estado del 20 de setiembre.» Los
 * montos iguales se juntan: con `allocate` hay a lo más dos distintos.
 */
export function previewText(installments: readonly Installment[]): string {
  const [first] = installments;
  if (first === undefined) return '';
  const groups: { amount: string; times: number }[] = [];
  for (const installment of installments) {
    const amount = installment.amount.toFixed();
    const last = groups.at(-1);
    if (last?.amount === amount) last.times += 1;
    else groups.push({ amount, times: 1 });
  }
  const currency = first.amount.currency;
  const parts = groups.map(
    (group) => `${String(group.times)} de ${formatMoney(group.amount, currency)}`,
  );

  return `${String(installments.length)} cuotas: ${parts.join(' y ')}. La primera va en el estado del ${formatDayMonth(first.statementDate.toString())}.`;
}

// --- Planes guardados ----------------------------------------------------------------------------

const STATE_TEXT: Readonly<Record<string, string>> = {
  PURCHASE_DELETED: 'La compra está borrada: sus cuotas no cuentan hasta que la restaures.',
  PURCHASE_NOT_ON_CARD: 'La compra ya no es de esta tarjeta: sus cuotas no cuentan.',
  PURCHASE_NOT_A_CHARGE: 'La compra ahora es un ingreso: sus cuotas no cuentan.',
  TOTAL_BELOW_PRICE: 'La compra supera el total en cuotas: corrige el monto o deshaz las cuotas.',
};

/** Qué pasa con un plan, en frases: cuántas se facturaron, la próxima y lo que falta. */
export function planLines(plan: InstallmentPlan): string[] {
  if (plan.state !== 'ACTIVE') return [STATE_TEXT[plan.state] ?? 'Sus cuotas no cuentan.'];
  const billed = plan.installments.filter((installment) => installment.billed).length;
  const next = plan.installments.find((installment) => !installment.billed);
  const lines = [`${String(billed)} de ${String(plan.count)} cuotas facturadas`];
  if (next !== undefined) {
    lines.push(
      `Próxima cuota: ${formatMoney(next.amount.amount, next.amount.currency)} en el estado del ${formatDayMonth(next.statementDate)}`,
    );
  }
  if (plan.pending !== null) {
    lines.push(`Faltan ${formatMoney(plan.pending.amount.amount, plan.pending.amount.currency)}`);
  }
  if (plan.interest !== null && plan.interest.amount !== '0.00') {
    lines.push(`Intereses: ${formatMoney(plan.interest.amount, plan.interest.currency)}`);
  }

  return lines;
}

/** En la lista de movimientos: «3 de 6 cuotas». Solo de un plan que cuenta. */
export function badgeText(plan: InstallmentPlan): string | null {
  if (plan.state !== 'ACTIVE') return null;
  const billed = plan.installments.filter((installment) => installment.billed).length;

  return `${String(billed)} de ${String(plan.count)} cuotas`;
}

/** Errores de la API de cuotas, en español. */
const API_ERRORS: Readonly<Record<string, string>> = {
  INSTALLMENT_COUNT_INVALID: `Las cuotas van de ${String(MIN_INSTALLMENTS)} a ${String(MAX_INSTALLMENTS)}.`,
  INSTALLMENT_TOO_SMALL: 'El monto es muy pequeño para tantas cuotas.',
  INSTALLMENT_TOTAL_BELOW_PRICE: 'El total en cuotas no puede ser menor que el precio.',
  INSTALLMENT_PURCHASE_NOT_ON_CARD: 'La compra no se hizo con esta tarjeta.',
  INSTALLMENT_PURCHASE_NOT_A_CHARGE: 'Un ingreso no se paga en cuotas.',
  INSTALLMENT_PLAN_ALREADY_EXISTS: 'Esta compra ya se paga en cuotas.',
  INVALID_AMOUNT: 'El total tiene más de 2 decimales.',
};

export function installmentErrorMessage(code: string | null): string {
  return (code === null ? undefined : API_ERRORS[code]) ?? 'No se pudieron guardar las cuotas.';
}
