import { Inject, Injectable } from '@nestjs/common';
import type { LocalDate, Money, TransactionType } from '@sol-a-sol/domain';

import {
  TRANSACTION_REPOSITORY,
  type TransactionRepository,
} from '../ports/transaction-repository.js';
import { TRANSFER_REPOSITORY, type TransferRepository } from '../ports/transfer-repository.js';

/** Lo gastado (o ingresado) en una categoría, en un tipo y una moneda. */
export interface CategoryTotal {
  /** La categoría de las transacciones, sin subir a su madre: eso lo decide quien consulta. */
  categoryId: string;
  type: TransactionType;
  amount: Money;
  /** Cuántas transacciones suma `amount`. */
  count: number;
}

/** Lo gastado (o ingresado) un día, en un tipo y una moneda. */
export interface DayTotal {
  date: LocalDate;
  type: TransactionType;
  amount: Money;
  /** Cuántas transacciones suma `amount`. */
  count: number;
}

/** Lo gastado (o ingresado) en un comercio, tal como se escribió, en un tipo y una moneda. */
export interface MerchantTotal {
  merchant: string;
  type: TransactionType;
  amount: Money;
  /** Cuántas transacciones suma `amount`. */
  count: number;
}

/** Una transacción con el método (por su tipo), o una transferencia que llega a él o sale. */
export type PaymentMethodMovementKind = TransactionType | 'TRANSFER_IN' | 'TRANSFER_OUT';

/** Lo que se movió con un método de pago un día, de un tipo y en una moneda. */
export interface PaymentMethodDayTotal {
  date: LocalDate;
  kind: PaymentMethodMovementKind;
  /** De una transferencia que llega, lo que **llegó**, en la moneda de este método. */
  amount: Money;
  /** Cuántos movimientos suma `amount`. */
  count: number;
}

/** Una transacción vigente, con lo mínimo para que otro módulo la siga (una compra en cuotas). */
export interface TransactionReference {
  id: string;
  date: LocalDate;
  type: TransactionType;
  amount: Money;
  paymentMethodId: string | null;
  description: string;
}

/**
 * Lecturas que `transactions` ofrece a otros módulos por su API pública (`index.ts`), para que el
 * presupuesto, los reportes, las tarjetas (H5) o los resúmenes (H6) no lean sus tablas ni importen
 * su interior. Igual que `CatalogLookup` en `catalog`.
 *
 * Solo movimientos **vigentes** (los borrados no cuentan). Las transferencias mueven plata entre
 * cuentas propias sin gastarla: solo las ve `paymentMethodTotalsByDay`, que es lo que necesita
 * una tarjeta. Nunca se convierte moneda. Exige el `userId`.
 */
@Injectable()
export class TransactionsLookup {
  constructor(
    @Inject(TRANSACTION_REPOSITORY) private readonly transactions: TransactionRepository,
    @Inject(TRANSFER_REPOSITORY) private readonly transfers: TransferRepository,
  ) {}

  /** Totales por categoría, tipo y moneda entre dos fechas, las dos incluidas. */
  async totalsByCategory(userId: string, from: LocalDate, to: LocalDate): Promise<CategoryTotal[]> {
    return this.transactions.totalsByCategory(userId, { from, to });
  }

  /** Totales por día, tipo y moneda entre dos fechas, las dos incluidas: las barras del dashboard. */
  async totalsByDay(userId: string, from: LocalDate, to: LocalDate): Promise<DayTotal[]> {
    return this.transactions.totalsByDay(userId, { from, to });
  }

  /**
   * Totales por comercio (tal como se escribió, sin espacios en los bordes), tipo y moneda entre
   * dos fechas, las dos incluidas. Las transacciones sin comercio no aparecen. Juntar los que solo
   * difieren en tildes o mayúsculas lo decide quien lee.
   */
  async totalsByMerchant(userId: string, from: LocalDate, to: LocalDate): Promise<MerchantTotal[]> {
    return this.transactions.totalsByMerchant(userId, { from, to });
  }

  /**
   * Todo lo que pasó con un método de pago hasta `to` (incluido), por día, tipo y moneda: las
   * transacciones con él y las transferencias que llegan (`TRANSFER_IN`, con lo que llegó) o salen
   * (`TRANSFER_OUT`, con lo que salió). Qué significa cada una para una tarjeta lo decide quien lee.
   */
  async paymentMethodTotalsByDay(
    userId: string,
    paymentMethodId: string,
    to: LocalDate,
  ): Promise<PaymentMethodDayTotal[]> {
    const [transactions, transfers] = await Promise.all([
      this.transactions.totalsByDay(userId, { to, paymentMethodId }),
      this.transfers.totalsByDayFor(userId, paymentMethodId, to),
    ]);

    return [
      ...transactions.map(({ date, type, amount, count }) => ({ date, kind: type, amount, count })),
      ...transfers.map(({ date, direction, amount, count }) => ({
        date,
        kind: direction === 'IN' ? ('TRANSFER_IN' as const) : ('TRANSFER_OUT' as const),
        amount,
        count,
      })),
    ];
  }

  /**
   * Las vigentes de la cuenta con esos ids; las borradas, las que no existen y las de otra cuenta
   * no aparecen. Para seguir a una compra (el plan de cuotas de una tarjeta) sin copiarla.
   */
  async liveTransactions(userId: string, ids: readonly string[]): Promise<TransactionReference[]> {
    const found = await Promise.all(
      [...new Set(ids)].map((id) => this.transactions.find(userId, id)),
    );

    return found.flatMap((transaction) =>
      transaction === null
        ? []
        : [
            {
              id: transaction.id,
              date: transaction.date,
              type: transaction.type,
              amount: transaction.amount,
              paymentMethodId: transaction.paymentMethodId,
              description: transaction.description,
            },
          ],
    );
  }
}
