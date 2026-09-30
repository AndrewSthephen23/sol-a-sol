import { Inject, Injectable } from '@nestjs/common';
import { type CardStatus, type Clock, computeCardStatus, today } from '@sol-a-sol/domain';

import { CLOCK } from '../../../shared/time/system-clock.js';
import { CreditCardNotFoundError } from '../domain/errors.js';
import {
  INSTALLMENT_PLAN_REPOSITORY,
  type InstallmentPlanRepository,
} from '../ports/installment-plan-repository.js';
import {
  CREDIT_CARD_MOVEMENTS_READER,
  type CreditCardMovementsReader,
} from '../ports/movements-reader.js';
import { type CreditCardView, ListCreditCards } from './credit-cards.js';
import { activePlans, resolveInstallmentPlans } from './installment-plans.js';

/** Una tarjeta con dónde está hoy. */
export interface CreditCardStatusView extends CreditCardView {
  status: CardStatus;
}

/**
 * Dónde está cada tarjeta hoy (Lima): ciclo en curso, lo que se debe, utilización, el último
 * estado cerrado con su fecha límite y las alertas. Se calcula al consultar con lo que
 * `transactions` registró y con los planes de cuotas activos: no hay tabla de saldos ni de estados.
 *
 * Una tarjeta archivada también trae su estado; qué avisos se muestran lo decide quien los
 * presenta (una archivada no avisa, 2026-09-29).
 */
@Injectable()
export class GetCreditCardStatuses {
  constructor(
    private readonly listCards: ListCreditCards,
    @Inject(CREDIT_CARD_MOVEMENTS_READER) private readonly movements: CreditCardMovementsReader,
    @Inject(INSTALLMENT_PLAN_REPOSITORY) private readonly plans: InstallmentPlanRepository,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  /** Todas las de la cuenta, en el orden en que se configuraron. */
  async all(userId: string): Promise<CreditCardStatusView[]> {
    const views = await this.listCards.execute(userId);

    return Promise.all(views.map((view) => this.withStatus(userId, view)));
  }

  /** Una sola: `CREDIT_CARD_NOT_FOUND` si no existe o es de otra cuenta. */
  async one(userId: string, id: string): Promise<CreditCardStatusView> {
    const view = (await this.listCards.execute(userId)).find((entry) => entry.card.id === id);
    if (view === undefined) throw new CreditCardNotFoundError();

    return this.withStatus(userId, view);
  }

  private async withStatus(userId: string, view: CreditCardView): Promise<CreditCardStatusView> {
    const day = today(this.clock);
    const [movements, plans] = await Promise.all([
      this.movements.paymentMethodTotalsByDay(userId, view.card.paymentMethodId, day),
      this.plans.listByCard(userId, view.card.id),
    ]);
    const installmentPlans = activePlans(
      await resolveInstallmentPlans(this.movements, userId, view.card, plans, day),
    );

    return {
      ...view,
      status: computeCardStatus({ settings: view.card, movements, installmentPlans, today: day }),
    };
  }
}
