import { Inject, Injectable } from '@nestjs/common';
import {
  type Clock,
  computeMonthlySummary,
  type MonthlySummary,
  type MonthlySummaryPeriods,
  monthlySummaryPeriods,
  today,
} from '@sol-a-sol/domain';

import { CLOCK } from '../../../shared/time/system-clock.js';
import {
  REPORT_ACTUALS_READER,
  REPORT_BUDGET_READER,
  REPORT_CAPTURES_READER,
  REPORT_CARDS_READER,
  REPORT_CATALOG_READER,
  REPORT_FEATURE_FLAGS,
  REPORT_GOALS_READER,
  type ReportActualsReader,
  type ReportBudgetReader,
  type ReportCapturesReader,
  type ReportCard,
  type ReportCardsReader,
  type ReportCatalogReader,
  type ReportFeatureFlags,
  type ReportGoal,
  type ReportGoalsReader,
} from '../ports/report-readers.js';

/** El resumen con lo que hace falta para presentarlo: los nombres de tarjetas y metas. */
export interface MonthlySummaryView {
  periods: MonthlySummaryPeriods;
  summary: MonthlySummary;
  /** Por id: el nombre de cada categoría de la cuenta, archivadas incluidas. */
  categories: ReadonlyMap<string, string>;
  /** Por id: lo que identifica a cada tarjeta. Vacío si `credit-cards` está apagado. */
  cards: ReadonlyMap<string, ReportCard['label']>;
  /** Por id: el nombre y la moneda de cada meta. Vacío si `goals` está apagado. */
  goals: ReadonlyMap<string, Pick<ReportGoal, 'name' | 'target'>>;
}

/**
 * El cierre de un mes (sección 2.7 del plan) en una sola consulta. Lo calcula el dominio
 * (`computeMonthlySummary`); aquí solo se juntan los datos, cada uno por la API pública de su
 * módulo. Lo de una subcategoría **sube a su madre**, como en el presupuesto y el dashboard.
 *
 * Un módulo **apagado** no se consulta y su sección no aparece: el resumen no delata lo que el 404
 * de ese módulo oculta.
 */
@Injectable()
export class GetMonthlySummary {
  constructor(
    @Inject(REPORT_ACTUALS_READER) private readonly actuals: ReportActualsReader,
    @Inject(REPORT_CATALOG_READER) private readonly catalog: ReportCatalogReader,
    @Inject(REPORT_BUDGET_READER) private readonly budget: ReportBudgetReader,
    @Inject(REPORT_CARDS_READER) private readonly cards: ReportCardsReader,
    @Inject(REPORT_GOALS_READER) private readonly goals: ReportGoalsReader,
    @Inject(REPORT_CAPTURES_READER) private readonly captures: ReportCapturesReader,
    @Inject(REPORT_FEATURE_FLAGS) private readonly flags: ReportFeatureFlags,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute({
    userId,
    year,
    month,
  }: {
    userId: string;
    year: number;
    month: number;
  }): Promise<MonthlySummaryView> {
    // Un mes que no existe lo rechaza `LocalDate`; uno que no empezó, el dominio.
    const periods = monthlySummaryPeriods(year, month, today(this.clock));
    const { current, previous } = periods;
    const [now, before, merchants, categories, lines, cards, goals, captures] = await Promise.all([
      this.actuals.totalsByCategory(userId, current.from, current.to),
      this.actuals.totalsByCategory(userId, previous.from, previous.to),
      this.actuals.totalsByMerchant(userId, current.from, current.to),
      this.catalog.allCategories(userId),
      this.flags.isEnabled('budgeting') ? this.budget.lines(userId, year, month) : undefined,
      this.flags.isEnabled('credit-cards')
        ? this.cards.monthlyCards(userId, current.from, current.to)
        : undefined,
      this.flags.isEnabled('goals') ? this.goals.goalsWithMovements(userId) : undefined,
      // Lo que llegó del teléfono y falta revisar (decisión 16 de H7): el mes puede estar incompleto.
      this.flags.isEnabled('capture')
        ? this.captures.pendingCaptures(userId, current.from, current.to)
        : undefined,
    ]);
    const parentOf = new Map(categories.map((category) => [category.id, category.parentId]));
    const toParent = <T extends { categoryId: string }>(entry: T): T => ({
      ...entry,
      categoryId: parentOf.get(entry.categoryId) ?? entry.categoryId,
    });

    return {
      periods,
      summary: computeMonthlySummary({
        periods,
        current: { byCategory: now.map(toParent), byMerchant: merchants },
        previous: { byCategory: before.map(toParent) },
        ...(lines === undefined ? {} : { budget: { lines } }),
        ...(cards === undefined ? {} : { cards }),
        ...(goals === undefined ? {} : { goals }),
        ...(captures === undefined ? {} : { captures }),
      }),
      categories: new Map(categories.map((category) => [category.id, category.name])),
      cards: new Map((cards ?? []).map((card) => [card.cardId, card.label])),
      goals: new Map((goals ?? []).map((goal) => [goal.goalId, goal])),
    };
  }
}
