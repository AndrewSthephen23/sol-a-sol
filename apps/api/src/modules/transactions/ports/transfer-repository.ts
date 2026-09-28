import type { LocalDate, Money, TransactionSource } from '@sol-a-sol/domain';

/** Una transferencia vigente entre dos cuentas propias. */
export interface Transfer {
  id: string;
  date: LocalDate;
  fromPaymentMethodId: string;
  toPaymentMethodId: string;
  /** Lo que salió, en la moneda de la cuenta de origen. */
  amount: Money;
  /** Lo que llegó, en la moneda de la cuenta de destino. Igual a `amount` si no cambia. */
  receivedAmount: Money;
  description: string;
  source: TransactionSource;
  createdAt: Date;
  updatedAt: Date;
}

export interface NewTransfer {
  userId: string;
  date: LocalDate;
  fromPaymentMethodId: string;
  toPaymentMethodId: string;
  amount: Money;
  receivedAmount: Money;
  description: string;
  source: TransactionSource;
}

/**
 * Todo método **exige el `userId`**, y va dentro del `WHERE`. Las borradas no aparecen en las
 * consultas normales.
 */
export interface TransferRepository {
  create(transfer: NewTransfer): Promise<Transfer>;

  /** `null` si no existe, **es de otra cuenta o está borrada**. */
  find(userId: string, id: string): Promise<Transfer | null>;
}

export const TRANSFER_REPOSITORY = Symbol('TransferRepository');
