import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { type MonthlyReportQuery, monthlyReportQuerySchema } from '@sol-a-sol/contracts';

import { RequiresFeature } from '../../../shared/feature-flags/feature-flag.guard.js';
import { ZodValidationPipe } from '../../../shared/http/zod-validation.pipe.js';
import { AccessTokenGuard, CurrentUser } from '../../identity/index.js';
import { GetMonthlyDashboard, type MonthlyDashboard } from '../application/monthly-dashboard.js';

/** Lo que viaja: montos como **string decimal** y porcentajes como string sin redondear. */
export interface MonthlyReportResponse {
  year: number;
  month: number;
  currencies: {
    currency: string;
    kpis: { income: string; expense: string; saving: string; debt: string; balance: string };
    daily: { date: string; amount: string }[];
    distribution: { categoryId: string | null; amount: string; share: string | null }[];
    byType: {
      type: string;
      total: string;
      categories: { categoryId: string; amount: string }[];
    }[];
  }[];
}

function toResponse(dashboard: MonthlyDashboard): MonthlyReportResponse {
  return {
    year: dashboard.year,
    month: dashboard.month,
    currencies: dashboard.currencies.map((entry) => ({
      currency: entry.currency,
      kpis: {
        income: entry.kpis.income.toFixed(),
        expense: entry.kpis.expense.toFixed(),
        saving: entry.kpis.saving.toFixed(),
        debt: entry.kpis.debt.toFixed(),
        balance: entry.kpis.balance.toFixed(),
      },
      daily: entry.daily.map((day) => ({
        date: day.date.toString(),
        amount: day.amount.toFixed(),
      })),
      distribution: entry.distribution.map((slice) => ({
        categoryId: slice.categoryId,
        amount: slice.amount.toFixed(),
        share: slice.share === null ? null : slice.share.toString(),
      })),
      byType: entry.byType.map((table) => ({
        type: table.type,
        total: table.total.toFixed(),
        categories: table.categories.map((row) => ({
          categoryId: row.categoryId,
          amount: row.amount.toFixed(),
        })),
      })),
    })),
  };
}

/**
 * Reportes: solo lectura. Hoy, el dashboard del mes (H4); el resumen mensual y el anual llegan en
 * H6. Solo desde una sesión; un token personal recibe 403.
 */
@Controller('reports')
@RequiresFeature('reports')
@UseGuards(AccessTokenGuard)
export class ReportsController {
  constructor(private readonly monthly: GetMonthlyDashboard) {}

  @Get('monthly')
  async getMonthly(
    @CurrentUser() userId: string,
    @Query(new ZodValidationPipe(monthlyReportQuerySchema)) query: MonthlyReportQuery,
  ): Promise<MonthlyReportResponse> {
    return toResponse(await this.monthly.execute({ userId, ...query }));
  }
}
