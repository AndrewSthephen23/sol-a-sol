import { Inject, Injectable } from '@nestjs/common';
import {
  type AnnualSummary,
  annualSummaryPeriod,
  type Clock,
  computeAnnualSummary,
  today,
} from '@sol-a-sol/domain';

import { CLOCK } from '../../../shared/time/system-clock.js';
import {
  REPORT_ACTUALS_READER,
  REPORT_CATALOG_READER,
  type ReportActualsReader,
  type ReportCatalogReader,
} from '../ports/report-readers.js';

/**
 * El año mes a mes (sección 2.8 del plan) en una sola consulta. Lo calcula el dominio
 * (`computeAnnualSummary`); aquí solo se juntan los datos: lo de cada día del año y lo de cada
 * categoría, con lo de cada subcategoría **subido a su madre**.
 */
@Injectable()
export class GetAnnualSummary {
  constructor(
    @Inject(REPORT_ACTUALS_READER) private readonly actuals: ReportActualsReader,
    @Inject(REPORT_CATALOG_READER) private readonly catalog: ReportCatalogReader,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute({ userId, year }: { userId: string; year: number }): Promise<AnnualSummary> {
    const day = today(this.clock);
    // Un año fuera de rango o que no empezó lo rechaza el dominio.
    const { from, to } = annualSummaryPeriod(year, day);
    const [byDay, byCategory, categories] = await Promise.all([
      this.actuals.totalsByDay(userId, from, to),
      this.actuals.totalsByCategory(userId, from, to),
      this.catalog.allCategories(userId),
    ]);
    const parentOf = new Map(categories.map((category) => [category.id, category.parentId]));

    return computeAnnualSummary({
      year,
      today: day,
      byDay,
      byCategory: byCategory.map((entry) => ({
        ...entry,
        categoryId: parentOf.get(entry.categoryId) ?? entry.categoryId,
      })),
    });
  }
}
