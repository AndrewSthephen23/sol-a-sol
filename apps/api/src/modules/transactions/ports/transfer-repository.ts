import type { Currency, LocalDate, Money, TransactionSource } from '@sol-a-sol/domain';

import type { PagePosition } from './transaction-repository.js';

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
  /** Solo al importar: la huella de su fila del CSV, única por cuenta. */
  importKey?: string;
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

/** Qué transferencias listar. Todo opcional; sin nada, todas las vigentes de la cuenta. */
export interface TransferFilter {
  /** Inclusivo. */
  from?: LocalDate;
  /** Inclusivo. */
  to?: LocalDate;
  /** Las que salen de esta cuenta **o** llegan a ella. */
  paymentMethodId?: string;
  /** Las que mueven esta moneda, al salir **o** al llegar. */
  currency?: Currency;
  /** Ya normalizado con `searchKey`: se busca dentro de la descripción. */
  search?: string;
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

  /** De estas huellas, las que ya tiene alguna transferencia de la cuenta (borradas incluidas). */
  importedKeys(userId: string, keys: readonly string[]): Promise<string[]>;

  /** Una página de vigentes en el orden del listado (`newestFirst`), después de `after`. */
  list(
    userId: string,
    filter: TransferFilter,
    page: { after: PagePosition | null; limit: number },
  ): Promise<Transfer[]>;
}

export const TRANSFER_REPOSITORY = Symbol('TransferRepository');
