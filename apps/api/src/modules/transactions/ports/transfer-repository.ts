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

/** Lo que se puede corregir. El origen (`source`) no está: no cambia al editar. */
export interface TransferChanges {
  date?: LocalDate;
  fromPaymentMethodId?: string;
  toPaymentMethodId?: string;
  amount?: Money;
  receivedAmount?: Money;
  description?: string;
}

/**
 * Todo método **exige el `userId`**, y va dentro del `WHERE`. Las borradas no aparecen en las
 * consultas normales.
 */
export interface TransferRepository {
  create(transfer: NewTransfer): Promise<Transfer>;

  /** `null` si no existe, **es de otra cuenta o está borrada**. */
  find(userId: string, id: string): Promise<Transfer | null>;

  /** `null` si no existe, es de otra cuenta o está borrada. */
  update(userId: string, id: string, changes: TransferChanges): Promise<Transfer | null>;

  /** Borrado lógico. `false` si no existe, es de otra cuenta o ya estaba borrada. */
  softDelete(userId: string, id: string, deletedAt: Date): Promise<boolean>;

  /** Deshace el borrado. `false` si no estaba borrada, no existe o es de otra cuenta. */
  restore(userId: string, id: string): Promise<boolean>;
}

export const TRANSFER_REPOSITORY = Symbol('TransferRepository');
