import { Inject, Injectable } from '@nestjs/common';
import { normalizeTagName } from '@sol-a-sol/domain';

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
    tag,
  }: {
    userId: string;
    fromId: string;
    intoId: string;
    /** Al convertir una subcategoría en etiqueta: la que reciben sus transacciones. */
    tag?: string;
  }): Promise<number> {
    return this.transactions.reassignCategory(
      userId,
      fromId,
      intoId,
      tag === undefined ? undefined : normalizeTagName(tag),
    );
  }
}
