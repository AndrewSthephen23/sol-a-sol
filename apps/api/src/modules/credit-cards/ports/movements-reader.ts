import type { CardMovementKind, LocalDate, Money } from '@sol-a-sol/domain';

/**
 * Lo que se movió con la tarjeta, sin conocer las tablas de `transactions`. Lo cumple
 * `TransactionsLookup`, de su API pública.
 *
 * **Exige el `userId`**: los movimientos de otra cuenta nunca se suman.
 */
export interface CreditCardMovementsReader {
  /**
   * Hasta `to` (incluido), por día, tipo y moneda: las transacciones con el método y las
   * transferencias que llegan a él (`TRANSFER_IN`, con lo que llegó) o salen (`TRANSFER_OUT`).
   */
  paymentMethodTotalsByDay(
    userId: string,
    paymentMethodId: string,
    to: LocalDate,
  ): Promise<{ date: LocalDate; kind: CardMovementKind; amount: Money }[]>;
}

export const CREDIT_CARD_MOVEMENTS_READER = Symbol('CreditCardMovementsReader');
