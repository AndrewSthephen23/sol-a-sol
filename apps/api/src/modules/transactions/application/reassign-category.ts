import { Inject, Injectable } from '@nestjs/common';

import {
  TRANSACTION_REPOSITORY,
  type TransactionRepository,
} from '../ports/transaction-repository.js';

/**
 * Pasa las transacciones de una categoría fusionada a su destino (ADR-0005). Lo dispara el evento
 * `catalog.category.merged`: `catalog` ya validó la fusión (misma cuenta y mismo tipo), y la clave
 * foránea compuesta lo vuelve a exigir. Repetirlo no cambia nada: la origen ya no tiene filas.
 */
@Injectable()
export class ReassignCategory {
  constructor(
    @Inject(TRANSACTION_REPOSITORY) private readonly transactions: TransactionRepository,
  ) {}

  async execute({
    userId,
    fromId,
    intoId,
  }: {
    userId: string;
    fromId: string;
    intoId: string;
  }): Promise<number> {
    return this.transactions.reassignCategory(userId, fromId, intoId);
  }
}
