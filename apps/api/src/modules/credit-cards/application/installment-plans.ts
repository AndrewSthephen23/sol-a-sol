import { Inject, Injectable } from '@nestjs/common';
import {
  assertInstallablePurchase,
  type CardInstallmentPlan,
  type Clock,
  computeInstallmentPlan,
  type Installment,
  installmentPlanState,
  type InstallmentPlanState,
  installmentPlanTotal,
  Money,
  pendingInstallments,
  today,
} from '@sol-a-sol/domain';

import { CLOCK } from '../../../shared/time/system-clock.js';
import {
  CreditCardNotFoundError,
  InstallmentPlanNotFoundError,
  InstallmentPurchaseNotFoundError,
} from '../domain/errors.js';
import {
  type CreditCard,
  CREDIT_CARD_REPOSITORY,
  type CreditCardRepository,
} from '../ports/credit-card-repository.js';
import {
  INSTALLMENT_PLAN_REPOSITORY,
  type InstallmentPlanRepository,
  type StoredInstallmentPlan,
} from '../ports/installment-plan-repository.js';
import {
  type CardPurchase,
  CREDIT_CARD_MOVEMENTS_READER,
  type CreditCardMovementsReader,
} from '../ports/movements-reader.js';

/** Un plan de cuotas como está hoy: con su compra, si sigue vigente, y sus cuotas. */
export interface InstallmentPlanView {
  plan: StoredInstallmentPlan;
  /** `null` si la compra se borró: el plan se ignora hasta que vuelva. */
  purchase: CardPurchase | null;
  state: InstallmentPlanState;
  /** Lo que se paga en cuotas; `null` sin compra. */
  total: Money | null;
  /** Total − precio; cero sin intereses, `null` sin compra. */
  interest: Money | null;
  /** Las cuotas con el estado de cuenta en que se facturan; vacío si el plan no está activo. */
  installments: Installment[];
  /** Las que todavía no se facturan. */
  pending: Installment[];
}

/**
 * Los planes de una tarjeta con cómo está cada compra **hoy** (el plan sigue a la compra,
 * 2026-09-30): así una compra corregida o borrada nunca deja un plan huérfano ni desviado.
 */
export async function resolveInstallmentPlans(
  movements: CreditCardMovementsReader,
  userId: string,
  card: CreditCard,
  plans: readonly StoredInstallmentPlan[],
  day: ReturnType<typeof today>,
): Promise<InstallmentPlanView[]> {
  const purchases = await movements.liveTransactions(
    userId,
    plans.map((plan) => plan.transactionId),
  );
  const byId = new Map(purchases.map((purchase) => [purchase.id, purchase]));

  return plans.map((plan) => {
    const purchase = byId.get(plan.transactionId) ?? null;
    const bankTotal =
      purchase === null || plan.totalAmount === null
        ? null
        : Money.of(plan.totalAmount, purchase.amount.currency);
    const state = installmentPlanState(purchase, card.paymentMethodId, bankTotal);
    if (purchase === null) {
      return { plan, purchase, state, total: null, interest: null, installments: [], pending: [] };
    }
    const total = installmentPlanTotal(purchase, bankTotal);
    const installments =
      state === 'ACTIVE'
        ? computeInstallmentPlan({
            total,
            count: plan.count,
            statementDay: card.statementDay,
            purchaseDate: purchase.date,
          })
        : [];

    return {
      plan,
      purchase,
      state,
      total,
      interest: total.subtract(purchase.amount),
      installments,
      pending: pendingInstallments(installments, day),
    };
  });
}

/** Lo que el estado de la tarjeta necesita de los planes **activos**. */
export function activePlans(views: readonly InstallmentPlanView[]): CardInstallmentPlan[] {
  return views.flatMap((view) =>
    view.state === 'ACTIVE' && view.purchase !== null && view.total !== null
      ? [
          {
            purchaseDate: view.purchase.date,
            price: view.purchase.amount,
            total: view.total,
            count: view.plan.count,
          },
        ]
      : [],
  );
}

/** Las compras en cuotas de una tarjeta, con las cuotas que faltan. */
@Injectable()
export class ListInstallmentPlans {
  constructor(
    @Inject(CREDIT_CARD_REPOSITORY) private readonly cards: CreditCardRepository,
    @Inject(INSTALLMENT_PLAN_REPOSITORY) private readonly plans: InstallmentPlanRepository,
    @Inject(CREDIT_CARD_MOVEMENTS_READER) private readonly movements: CreditCardMovementsReader,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(userId: string, creditCardId: string): Promise<InstallmentPlanView[]> {
    const card = await this.cards.find(userId, creditCardId);
    if (card === null) throw new CreditCardNotFoundError();
    const plans = await this.plans.listByCard(userId, creditCardId);

    return resolveInstallmentPlans(this.movements, userId, card, plans, today(this.clock));
  }
}

export interface InstallmentPlanInput {
  transactionId: string;
  count: number;
  /** Con intereses, el total del banco (string decimal, en la moneda de la compra). */
  totalAmount: string | null;
}

/**
 * Marca una compra hecha con la tarjeta como pagada en cuotas. La compra tiene que ser vigente y
 * de la cuenta, un cargo con **esta** tarjeta, y el total del banco no puede bajar del precio.
 */
@Injectable()
export class CreateInstallmentPlan {
  constructor(
    @Inject(CREDIT_CARD_REPOSITORY) private readonly cards: CreditCardRepository,
    @Inject(INSTALLMENT_PLAN_REPOSITORY) private readonly plans: InstallmentPlanRepository,
    @Inject(CREDIT_CARD_MOVEMENTS_READER) private readonly movements: CreditCardMovementsReader,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(
    userId: string,
    creditCardId: string,
    input: InstallmentPlanInput,
  ): Promise<InstallmentPlanView> {
    const card = await this.cards.find(userId, creditCardId);
    if (card === null) throw new CreditCardNotFoundError();
    const [purchase] = await this.movements.liveTransactions(userId, [input.transactionId]);
    if (purchase === undefined) throw new InstallmentPurchaseNotFoundError();
    const bankTotal =
      input.totalAmount === null ? null : Money.of(input.totalAmount, purchase.amount.currency);
    assertInstallablePurchase(purchase, card.paymentMethodId, bankTotal);
    // Revisa el número de cuotas y que ninguna quede en cero antes de guardar.
    computeInstallmentPlan({
      total: installmentPlanTotal(purchase, bankTotal),
      count: input.count,
      statementDay: card.statementDay,
      purchaseDate: purchase.date,
    });

    const plan = await this.plans.create(userId, {
      creditCardId,
      transactionId: purchase.id,
      count: input.count,
      totalAmount: bankTotal?.toFixed() ?? null,
    });
    const [view] = await resolveInstallmentPlans(
      this.movements,
      userId,
      card,
      [plan],
      today(this.clock),
    );
    if (view === undefined) throw new InstallmentPlanNotFoundError();

    return view;
  }
}

/** Deshace el plan: la compra vuelve a pagarse entera en su estado de cuenta. */
@Injectable()
export class DeleteInstallmentPlan {
  constructor(
    @Inject(INSTALLMENT_PLAN_REPOSITORY) private readonly plans: InstallmentPlanRepository,
  ) {}

  async execute(userId: string, creditCardId: string, id: string): Promise<void> {
    if (!(await this.plans.delete(userId, creditCardId, id))) {
      throw new InstallmentPlanNotFoundError();
    }
  }
}
