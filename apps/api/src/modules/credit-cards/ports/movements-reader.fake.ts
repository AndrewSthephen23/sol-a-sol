import type { CardMovementKind, LocalDate, Money } from '@sol-a-sol/domain';

import type { CreditCardMovementsReader } from './movements-reader.js';

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
