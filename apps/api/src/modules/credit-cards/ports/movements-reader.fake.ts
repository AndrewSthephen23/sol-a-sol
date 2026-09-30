import type { CardMovementKind, LocalDate, Money } from '@sol-a-sol/domain';

import type { CardPurchase, CreditCardMovementsReader } from './movements-reader.js';

interface FakeMovement {
  userId: string;
  paymentMethodId: string;
  date: LocalDate;
  kind: CardMovementKind;
  amount: Money;
}

/** Movimientos en memoria, cada uno de una cuenta y un método, como en la base. */
export class FakeCreditCardMovementsReader implements CreditCardMovementsReader {
  private readonly movements: FakeMovement[] = [];
  private readonly purchases: { userId: string; purchase: CardPurchase; deleted: boolean }[] = [];

  /** Una transacción que un plan de cuotas puede seguir; `deleted` la esconde, como la base. */
  withPurchase(userId: string, purchase: CardPurchase, deleted = false): this {
    this.purchases.push({ userId, purchase, deleted });

    return this;
  }

  /** Corrige o borra una compra ya registrada, como lo haría `transactions`. */
  change(id: string, changes: Partial<CardPurchase> & { deleted?: boolean }): void {
    const entry = this.purchases.find((candidate) => candidate.purchase.id === id);
    if (entry === undefined) throw new Error(`No purchase ${id}`);
    const { deleted, ...fields } = changes;
    entry.purchase = { ...entry.purchase, ...fields };
    if (deleted !== undefined) entry.deleted = deleted;
  }

  liveTransactions(userId: string, ids: readonly string[]): Promise<CardPurchase[]> {
    return Promise.resolve(
      this.purchases
        .filter(
          (entry) => entry.userId === userId && !entry.deleted && ids.includes(entry.purchase.id),
        )
        .map((entry) => ({ ...entry.purchase })),
    );
  }

  with(movement: FakeMovement): this {
    this.movements.push(movement);

    return this;
  }

  paymentMethodTotalsByDay(
    userId: string,
    paymentMethodId: string,
    to: LocalDate,
  ): Promise<{ date: LocalDate; kind: CardMovementKind; amount: Money }[]> {
    return Promise.resolve(
      this.movements
        .filter(
          (movement) =>
            movement.userId === userId &&
            movement.paymentMethodId === paymentMethodId &&
            !movement.date.isAfter(to),
        )
        .map(({ date, kind, amount }) => ({ date, kind, amount })),
    );
  }
}
