import { Controller, Get, Query, Res, UseGuards } from '@nestjs/common';
import {
  type AnnualReportQuery,
  annualReportQuerySchema,
  type MonthlyReportQuery,
  monthlyReportQuerySchema,
  type MonthlySummaryExportQuery,
  monthlySummaryExportQuerySchema,
} from '@sol-a-sol/contracts';

import { RequiresFeature } from '../../../shared/feature-flags/feature-flag.guard.js';
import { ZodValidationPipe } from '../../../shared/http/zod-validation.pipe.js';
import { AccessTokenGuard, CurrentUser } from '../../identity/index.js';
import { GetAnnualSummary } from '../application/annual-summary.js';
import { GetMonthlyDashboard, type MonthlyDashboard } from '../application/monthly-dashboard.js';
import { GetMonthlySummary } from '../application/monthly-summary.js';
import { monthlySummaryCsv } from '../application/monthly-summary-csv.js';
import { type AnnualSummaryResponse, annualSummaryResponse } from './annual-summary.response.js';
import { type MonthlySummaryResponse, monthlySummaryResponse } from './monthly-summary.response.js';

/** Lo mínimo que se necesita de la respuesta, para no atar el controller a Express. */
interface HeaderResponse {
  setHeader(name: string, value: string): void;
}

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
 * Reportes: solo lectura. El dashboard del mes (H4) y los resúmenes mensual y anual (H6). Solo desde una sesión; un token personal recibe 403.
 */
@Controller('reports')
@RequiresFeature('reports')
@UseGuards(AccessTokenGuard)
export class ReportsController {
  constructor(
    private readonly monthly: GetMonthlyDashboard,
    private readonly monthlySummary: GetMonthlySummary,
    private readonly annualSummary: GetAnnualSummary,
  ) {}

  @Get('monthly')
  async getMonthly(
    @CurrentUser() userId: string,
    @Query(new ZodValidationPipe(monthlyReportQuerySchema)) query: MonthlyReportQuery,
  ): Promise<MonthlyReportResponse> {
    return toResponse(await this.monthly.execute({ userId, ...query }));
  }

  /** El cierre del mes: un mes que no empezó responde 422 (`SUMMARY_MONTH_IN_FUTURE`). */
  @Get('monthly-summary')
  async getMonthlySummary(
    @CurrentUser() userId: string,
    @Query(new ZodValidationPipe(monthlyReportQuerySchema)) query: MonthlyReportQuery,
  ): Promise<MonthlySummaryResponse> {
    return monthlySummaryResponse(await this.monthlySummary.execute({ userId, ...query }));
  }

  /**
   * El cierre del mes como archivo CSV (decisión 15 de H6): se descarga, no se guarda en caché (son
   * datos de la cuenta) y nada del usuario se ejecuta como fórmula al abrirlo.
   */
  @Get('monthly-summary/export')
  async exportMonthlySummary(
    @CurrentUser() userId: string,
    @Query(new ZodValidationPipe(monthlySummaryExportQuerySchema)) query: MonthlySummaryExportQuery,
    @Res({ passthrough: true }) response: HeaderResponse,
  ): Promise<string> {
    const file = monthlySummaryCsv(
      await this.monthlySummary.execute({ userId, year: query.year, month: query.month }),
    );
    response.setHeader('Content-Type', 'text/csv; charset=utf-8');
    response.setHeader('Content-Disposition', `attachment; filename="${file.filename}"`);
    response.setHeader('Cache-Control', 'no-store');

    return file.content;
  }

  /** El año mes a mes: un año fuera de rango o que no empezó responde 422. */
  @Get('annual')
  async getAnnual(
    @CurrentUser() userId: string,
    @Query(new ZodValidationPipe(annualReportQuerySchema)) query: AnnualReportQuery,
  ): Promise<AnnualSummaryResponse> {
    return annualSummaryResponse(await this.annualSummary.execute({ userId, year: query.year }));
  }
}
