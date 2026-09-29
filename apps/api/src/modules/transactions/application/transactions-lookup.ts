import { Inject, Injectable } from '@nestjs/common';
import type { LocalDate, Money, TransactionType } from '@sol-a-sol/domain';

import {
  TRANSACTION_REPOSITORY,
  type TransactionRepository,
} from '../ports/transaction-repository.js';

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

/**
 * Lecturas que `transactions` ofrece a otros módulos por su API pública (`index.ts`), para que el
 * presupuesto, los reportes, las tarjetas (H5) o los resúmenes (H6) no lean sus tablas ni importen
 * su interior. Igual que `CatalogLookup` en `catalog`.
 *
 * Solo transacciones **vigentes** (las borradas no cuentan) y nunca transferencias, que mueven
 * plata entre cuentas propias sin gastarla. Nunca se convierte moneda. Exige el `userId`.
 */
@Injectable()
export class TransactionsLookup {
  constructor(
    @Inject(TRANSACTION_REPOSITORY) private readonly transactions: TransactionRepository,
  ) {}

  /** Totales por categoría, tipo y moneda entre dos fechas, las dos incluidas. */
  async totalsByCategory(userId: string, from: LocalDate, to: LocalDate): Promise<CategoryTotal[]> {
    return this.transactions.totalsByCategory(userId, { from, to });
  }

  /** Totales por día, tipo y moneda entre dos fechas, las dos incluidas: las barras del dashboard. */
  async totalsByDay(userId: string, from: LocalDate, to: LocalDate): Promise<DayTotal[]> {
    return this.transactions.totalsByDay(userId, { from, to });
  }
}
