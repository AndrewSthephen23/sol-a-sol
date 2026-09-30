import { DomainError } from '../errors/domain-error.js';
import { type Money } from '../money/money.js';
import type { TransactionType } from '../transactions/transaction-policy.js';
import { cardMovementEffect } from './card-status.js';
import { InstallmentTotalBelowPriceError } from './installment-plan.js';

/**
 * Qué compra se puede pagar en cuotas, y qué pasa con el plan cuando la compra cambia (decidido
 * con el autor el 2026-09-29, `docs/modules/credit-cards.md`).
 *
 * El plan **sigue a la compra**: se calcula al consultar con cómo está la compra hoy. Sin
 * intereses, su total es siempre el monto actual de la compra. Si la compra se borra, el plan se
 * ignora (y vuelve si se restaura); si cambia de forma que el plan ya no tiene sentido, el plan
 * queda inválido y tampoco cuenta, hasta que se corrija.
 */

/** Lo que hace falta saber de la compra, como está hoy. */
export interface PlannedPurchase {
  type: TransactionType;
  amount: Money;
  paymentMethodId: string | null;
}

export type InstallmentPlanState =
  | 'ACTIVE'
  | 'PURCHASE_DELETED'
  | 'PURCHASE_NOT_ON_CARD'
  | 'PURCHASE_NOT_A_CHARGE'
  | 'TOTAL_BELOW_PRICE';

export class InstallmentPurchaseNotOnCardError extends DomainError {
  readonly code = 'INSTALLMENT_PURCHASE_NOT_ON_CARD';

  constructor() {
    super('Only a purchase made with this card can be paid in installments on it.');
  }
}

export class InstallmentPurchaseNotAChargeError extends DomainError {
  readonly code = 'INSTALLMENT_PURCHASE_NOT_A_CHARGE';

  constructor() {
    super('An income cannot be paid in installments: only a charge to the card can.');
  }
}

/**
 * Cómo está el plan hoy. `purchase` es `null` si la compra se borró (o nunca existió); `total`,
 * `null` sin intereses. Solo un plan `ACTIVE` cuenta en el estado de la tarjeta.
 */
export function installmentPlanState(
  purchase: PlannedPurchase | null,
  cardMethodId: string,
  total: Money | null,
): InstallmentPlanState {
  if (purchase === null) return 'PURCHASE_DELETED';
  if (purchase.paymentMethodId !== cardMethodId) return 'PURCHASE_NOT_ON_CARD';
  if (cardMovementEffect(purchase.type) === 'CREDIT') return 'PURCHASE_NOT_A_CHARGE';
  if (total?.subtract(purchase.amount).isNegative() === true) return 'TOTAL_BELOW_PRICE';
  return 'ACTIVE';
}

/** Lo que se paga en cuotas: el total del banco, o sin intereses, el monto de la compra hoy. */
export function installmentPlanTotal(purchase: PlannedPurchase, total: Money | null): Money {
  return total ?? purchase.amount;
}

/**
 * Para marcar una compra en cuotas: hecha con **esta** tarjeta, un cargo (un ingreso es una
 * devolución) y con un total del banco que no baja del precio.
 */
export function assertInstallablePurchase(
  purchase: PlannedPurchase,
  cardMethodId: string,
  total: Money | null,
): void {
  const state = installmentPlanState(purchase, cardMethodId, total);
  if (state === 'PURCHASE_NOT_ON_CARD') throw new InstallmentPurchaseNotOnCardError();
  if (state === 'PURCHASE_NOT_A_CHARGE') throw new InstallmentPurchaseNotAChargeError();
  if (state === 'TOTAL_BELOW_PRICE') throw new InstallmentTotalBelowPriceError();
}
