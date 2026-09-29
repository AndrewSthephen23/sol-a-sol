import { Inject, Injectable } from '@nestjs/common';
import {
  assertBudgetableCategory,
  assertBudgetLines,
  assertBudgetMonth,
  type BudgetTypeReport,
  type Currency,
  LocalDate,
  Money,
  summarizeBudget,
} from '@sol-a-sol/domain';

import { BudgetCategoryNotFoundError } from '../domain/errors.js';
import {
  BUDGET_REPOSITORY,
  type BudgetMonth,
  type BudgetRepository,
  type StoredBudgetLine,
} from '../ports/budget-repository.js';
import { BUDGET_ACTUALS_READER, type BudgetActualsReader } from '../ports/actuals-reader.js';
import { BUDGET_CATALOG_READER, type BudgetCatalogReader } from '../ports/catalog-reader.js';

/** El presupuesto de un mes: sus partidas y, por tipo y moneda, lo planeado contra lo real. */
export interface Budget {
  year: number;
  month: number;
  lines: StoredBudgetLine[];
  summary: BudgetTypeReport[];
}

/**
 * El presupuesto de un mes con lo real al lado: diferencia, % ejecutado y estado de cada partida,
 * la fila «Sin presupuesto» y el total de cada tipo, por moneda (`summarizeBudget`).
 *
 * Lo real de una subcategoría **sube a su madre**, que es donde va la partida (decisión 2 de H4).
 * Un mes sin presupuesto no es un error: sus partidas son ninguna, y lo real igual se muestra.
 * El mes en curso llega hasta hoy solo: una transacción nunca es futura.
 */
@Injectable()
export class GetBudget {
  constructor(
    @Inject(BUDGET_REPOSITORY) private readonly budgets: BudgetRepository,
    @Inject(BUDGET_CATALOG_READER) private readonly catalog: BudgetCatalogReader,
    @Inject(BUDGET_ACTUALS_READER) private readonly actuals: BudgetActualsReader,
  ) {}

  async execute(month: BudgetMonth): Promise<Budget> {
    assertBudgetMonth(month.year, month.month);
    const first = LocalDate.of(month.year, month.month, 1);
    const [lines, categories, real] = await Promise.all([
      this.budgets.lines(month),
      this.catalog.allCategories(month.userId),
      this.actuals.totalsByCategory(month.userId, first, first.lastDayOfMonth()),
    ]);

    const parentOf = new Map(categories.map((category) => [category.id, category.parentId]));
    const summary = summarizeBudget(
      lines,
      real.map((entry) => ({
        ...entry,
        categoryId: parentOf.get(entry.categoryId) ?? entry.categoryId,
      })),
    );

    return { year: month.year, month: month.month, lines, summary };
  }
}

export interface BudgetLineInput {
  categoryId: string;
  /** String decimal (`"800.00"`), para no perder precisión antes de llegar a `Money`. */
  plannedAmount: string;
  currency: Currency;
}

/**
 * Guarda el presupuesto de un mes **entero**, pasado o futuro (no hay mes cerrado): la lista
 * reemplaza a la anterior. Todo se revisa antes de escribir; o quedan todas las partidas o
 * ninguna.
 *
 * Cada categoría tiene que ser de la cuenta, **madre y activa**. Una partida que el mes **ya
 * tenía** se puede volver a mandar aunque su categoría se haya archivado después: corregir un mes
 * pasado no obliga a borrarla (lo mismo que al corregir una transacción).
 */
@Injectable()
export class ReplaceBudget {
  constructor(
    @Inject(BUDGET_REPOSITORY) private readonly budgets: BudgetRepository,
    @Inject(BUDGET_CATALOG_READER) private readonly catalog: BudgetCatalogReader,
    private readonly getBudget: GetBudget,
  ) {}

  /** Responde el mes como quedó, con lo real al lado, igual que `GetBudget`. */
  async execute(month: BudgetMonth, lines: readonly BudgetLineInput[]): Promise<Budget> {
    assertBudgetMonth(month.year, month.month);
    const planned = lines.map((line) => ({
      categoryId: line.categoryId,
      planned: Money.of(line.plannedAmount, line.currency),
    }));
    assertBudgetLines(planned);

    const already = new Set((await this.budgets.lines(month)).map((line) => line.categoryId));
    const types = new Map<string, StoredBudgetLine['type']>();
    for (const categoryId of new Set(planned.map((line) => line.categoryId))) {
      const category = await this.catalog.category(month.userId, categoryId);
      if (category === null) throw new BudgetCategoryNotFoundError();
      assertBudgetableCategory({
        parentId: category.parentId,
        archived: category.archived && !already.has(categoryId),
      });
      types.set(categoryId, category.type);
    }

    // La partida toma el tipo de su categoría: nunca se supone uno.
    const typeOf = (categoryId: string): StoredBudgetLine['type'] => {
      const type = types.get(categoryId);
      if (type === undefined) throw new BudgetCategoryNotFoundError();

      return type;
    };
    await this.budgets.replace(
      month,
      planned.map((line) => ({ ...line, type: typeOf(line.categoryId) })),
    );

    return this.getBudget.execute(month);
  }
}
