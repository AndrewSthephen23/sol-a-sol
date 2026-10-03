import { Inject, Injectable } from '@nestjs/common';
import { cardMovementEffect, CURRENCIES, type LocalDate, Money } from '@sol-a-sol/domain';

import {
  INSTALLMENT_PLAN_REPOSITORY,
  type InstallmentPlanRepository,
} from '../ports/installment-plan-repository.js';
import {
  CREDIT_CARD_MOVEMENTS_READER,
  type CreditCardMovementsReader,
} from '../ports/movements-reader.js';
import { cardStatusAt } from './credit-card-status.js';
import { type CreditCardView, ListCreditCards } from './credit-cards.js';

/** Un estado de cuenta que cerró en el mes, a la fecha de corte de quien pregunta. */
export interface MonthStatement {
  closingDate: LocalDate;
  dueDate: LocalDate;
  /** Uno por moneda de la tarjeta: la deuda al corte y lo que falta pagar a la fecha de corte. */
  balances: { balance: Money; remaining: Money }[];
}

/** Una tarjeta en un mes: lo que la identifica, lo cargado y el estado que cerró en él. */
export interface MonthlyCard {
  cardId: string;
  /** Alias, banco y últimos 4: nunca más. */
  label: { alias: string; institution: string | null; last4: string | null };
  archived: boolean;
  /** Lo cargado en el periodo, por moneda (solo las que tuvieron cargos). */
  charges: Money[];
  /** El que cerró en el periodo, si ya cerró; a lo más uno. */
  statements: MonthStatement[];
}

/**
 * Lecturas que `credit-cards` ofrece a otros módulos por su API pública (`index.ts`), para que el
 * resumen mensual (H6) no lea sus tablas ni importe su interior. Se calcula con lo mismo que el
 * estado de cada tarjeta (`computeCardStatus`). Exige el `userId`.
 */
@Injectable()
export class CreditCardsLookup {
  constructor(
    private readonly listCards: ListCreditCards,
    @Inject(CREDIT_CARD_MOVEMENTS_READER) readonly movements: CreditCardMovementsReader,
    @Inject(INSTALLMENT_PLAN_REPOSITORY) readonly plans: InstallmentPlanRepository,
  ) {}

  /**
   * Cada tarjeta de la cuenta, archivadas incluidas, en un periodo de un mes (`from` es el día 1;
   * `to`, la fecha de corte): lo **cargado** en él (compras, deuda, disposiciones; la compra en
   * cuotas entera, el día que se hizo) y el estado de cuenta que **cerró** en él, con lo que
   * faltaba pagar a la fecha de corte.
   */
  async monthlyCards(userId: string, from: LocalDate, to: LocalDate): Promise<MonthlyCard[]> {
    const views = await this.listCards.execute(userId);

    return Promise.all(views.map((view) => this.monthlyCard(userId, view, from, to)));
  }

  private async monthlyCard(
    userId: string,
    view: CreditCardView,
    from: LocalDate,
    to: LocalDate,
  ): Promise<MonthlyCard> {
    const { card, paymentMethod } = view;
    const movements = await this.movements.paymentMethodTotalsByDay(userId, paymentMethod.id, to);
    const charged = movements.filter(
      (movement) => !movement.date.isBefore(from) && cardMovementEffect(movement.kind) === 'CHARGE',
    );
    const charges = CURRENCIES.flatMap((currency) => {
      const inCurrency = charged.filter((movement) => movement.amount.currency === currency);

      return inCurrency.length === 0
        ? []
        : [
            inCurrency.reduce(
              (total, movement) => total.add(movement.amount),
              Money.zero(currency),
            ),
          ];
    });

    return {
      cardId: card.id,
      label: {
        alias: paymentMethod.alias,
        institution: paymentMethod.institution,
        last4: paymentMethod.last4,
      },
      archived: paymentMethod.archived,
      charges,
      statements: await this.closedIn(userId, view, from, to),
    };
  }

  /**
   * El estado que cierra en el mes, si ya cerró a la fecha de corte. El mismo día del corte el
   * estado todavía no está «cerrado» para `computeCardStatus`: si el corte es justo la fecha de
   * corte del resumen, se mira al día siguiente, pero con los movimientos solo hasta ella.
   */
  private async closedIn(
    userId: string,
    view: CreditCardView,
    from: LocalDate,
    to: LocalDate,
  ): Promise<MonthStatement[]> {
    const closingDate = from.withDayOfMonth(view.card.statementDay);
    if (closingDate.isAfter(to)) return [];
    const day = closingDate.isBefore(to) ? to : closingDate.plusDays(1);
    const { statement } = await cardStatusAt(this, userId, view, day, to);
    if (statement === null) return [];

    return [
      {
        closingDate: statement.cycle.end,
        dueDate: statement.dueDate,
        balances: statement.balances.map(({ balance, remaining }) => ({ balance, remaining })),
      },
    ];
  }
}
