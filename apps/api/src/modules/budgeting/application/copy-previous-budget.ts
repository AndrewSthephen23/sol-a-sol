import { Inject, Injectable } from '@nestjs/common';
import { assertBudgetMonth, type Currency } from '@sol-a-sol/domain';

import {
  BUDGET_REPOSITORY,
  type BudgetMonth,
  type BudgetRepository,
  type StoredBudgetLine,
} from '../ports/budget-repository.js';
import { BUDGET_CATALOG_READER, type BudgetCatalogReader } from '../ports/catalog-reader.js';
import { type Budget, GetBudget } from './budgets.js';

export interface CopiedBudget extends Budget {
  /** De qué mes se copió, o `null` si no había ninguno anterior con presupuesto. */
  copiedFrom: { year: number; month: number } | null;
  /** Partidas del origen que no se copiaron porque su categoría está archivada (o ya no existe). */
  skipped: { categoryId: string; currency: Currency }[];
}

/**
 * Copia el presupuesto del mes anterior al pedido (decisión 6 de H4, 2026-09-29):
 *
 * - **Solo completa lo que falta:** una partida que el mes ya tiene (misma categoría y moneda)
 *   nunca se pisa.
 * - Si el mes anterior está vacío, copia del **último mes con presupuesto**.
 * - Las categorías **archivadas no se copian**, y la respuesta dice cuáles quedaron fuera para
 *   que no desaparezcan en silencio.
 * - Sin ningún mes anterior con presupuesto, no copia nada y no es un error.
 *
 * Todo se escribe de una vez: o entran todas las partidas copiadas o ninguna.
 */
@Injectable()
export class CopyPreviousBudget {
  constructor(
    @Inject(BUDGET_REPOSITORY) private readonly budgets: BudgetRepository,
    @Inject(BUDGET_CATALOG_READER) private readonly catalog: BudgetCatalogReader,
    private readonly getBudget: GetBudget,
  ) {}

  async execute(month: BudgetMonth): Promise<CopiedBudget> {
    assertBudgetMonth(month.year, month.month);
    const source = await this.budgets.latestBefore(month);
    if (source === null) {
      return { ...(await this.getBudget.execute(month)), copiedFrom: null, skipped: [] };
    }

    const current = await this.budgets.lines(month);
    const taken = new Set(current.map(keyOf));
    const copied: StoredBudgetLine[] = [];
    const skipped: CopiedBudget['skipped'] = [];
    for (const line of source.lines.filter((candidate) => !taken.has(keyOf(candidate)))) {
      const category = await this.catalog.category(month.userId, line.categoryId);
      if (category === null || category.archived) {
        skipped.push({ categoryId: line.categoryId, currency: line.planned.currency });
      } else {
        copied.push(line);
      }
    }
    if (copied.length > 0) await this.budgets.replace(month, [...current, ...copied]);

    return {
      ...(await this.getBudget.execute(month)),
      copiedFrom: { year: source.year, month: source.month },
      skipped,
    };
  }
}

function keyOf(line: StoredBudgetLine): string {
  return `${line.categoryId}|${line.planned.currency}`;
}
