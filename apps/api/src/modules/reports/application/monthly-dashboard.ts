import { Inject, Injectable } from '@nestjs/common';
import {
  buildMonthlyDashboard,
  type Clock,
  type CurrencyDashboard,
  LocalDate,
  today,
} from '@sol-a-sol/domain';

import { CLOCK } from '../../../shared/time/system-clock.js';
import {
  REPORT_ACTUALS_READER,
  REPORT_CATALOG_READER,
  type ReportActualsReader,
  type ReportCatalogReader,
} from '../ports/report-readers.js';

export interface MonthlyDashboard {
  year: number;
  month: number;
  currencies: CurrencyDashboard[];
}

/**
 * El dashboard de un mes en una sola consulta (sección 2.4 del plan): KPIs, gasto diario, dona por
 * categoría madre y tablas por tipo, **por moneda**. Lo arma el dominio (`buildMonthlyDashboard`);
 * aquí solo se juntan los datos.
 *
 * Lo de una subcategoría **sube a su madre**, como en el presupuesto. El mes en curso llega hasta
 * hoy en Lima. Solo lectura: `reports` no tiene tablas propias.
 */
@Injectable()
export class GetMonthlyDashboard {
  constructor(
    @Inject(REPORT_ACTUALS_READER) private readonly actuals: ReportActualsReader,
    @Inject(REPORT_CATALOG_READER) private readonly catalog: ReportCatalogReader,
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
  }): Promise<MonthlyDashboard> {
    // Un mes que no existe lo rechaza `LocalDate` (`INVALID_LOCAL_DATE`).
    const first = LocalDate.of(year, month, 1);
    const last = first.lastDayOfMonth();
    const [byCategory, byDay, categories] = await Promise.all([
      this.actuals.totalsByCategory(userId, first, last),
      this.actuals.totalsByDay(userId, first, last),
      this.catalog.allCategories(userId),
    ]);
    const parentOf = new Map(categories.map((category) => [category.id, category.parentId]));

    return {
      year,
      month,
      currencies: buildMonthlyDashboard({
        year,
        month,
        today: today(this.clock),
        byCategory: byCategory.map((entry) => ({
          ...entry,
          categoryId: parentOf.get(entry.categoryId) ?? entry.categoryId,
        })),
        byDay,
      }),
    };
  }
}
