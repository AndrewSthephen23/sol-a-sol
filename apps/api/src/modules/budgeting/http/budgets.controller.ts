import { Body, Controller, Get, HttpCode, Param, Post, Put, UseGuards } from '@nestjs/common';
import {
  type BudgetMonthParams,
  budgetMonthParamsSchema,
  type PutBudgetRequest,
  putBudgetRequestSchema,
} from '@sol-a-sol/contracts';
import type { BudgetVariance } from '@sol-a-sol/domain';

import { RequiresFeature } from '../../../shared/feature-flags/feature-flag.guard.js';
import { ZodValidationPipe } from '../../../shared/http/zod-validation.pipe.js';
import { AccessTokenGuard, CurrentUser } from '../../identity/index.js';
import { type Budget, GetBudget, ReplaceBudget } from '../application/budgets.js';
import { type CopiedBudget, CopyPreviousBudget } from '../application/copy-previous-budget.js';

/**
 * Lo planeado contra lo real, con los montos como **string decimal** y el % ejecutado como string
 * **sin redondear** (la web muestra 2 decimales), o `null` si lo planeado es cero.
 */
export interface VarianceResponse {
  planned: string;
  actual: string;
  difference: string;
  executed: string | null;
  status: BudgetVariance['status'];
}

/** Lo que viaja: los montos como **string decimal**, nunca como número. */
export interface BudgetResponse {
  year: number;
  month: number;
  lines: { categoryId: string; type: string; plannedAmount: string; currency: string }[];
  summary: {
    type: string;
    currency: string;
    lines: (VarianceResponse & { categoryId: string })[];
    unbudgeted: { categoryId: string; amount: string }[];
    total: VarianceResponse;
  }[];
}

/** El mes después de copiar: de dónde se copió y qué partidas quedaron fuera (archivadas). */
export type CopiedBudgetResponse = BudgetResponse & {
  copiedFrom: { year: number; month: number } | null;
  skipped: { categoryId: string; currency: string }[];
};

function varianceOf(variance: BudgetVariance): VarianceResponse {
  return {
    planned: variance.planned.toFixed(),
    actual: variance.actual.toFixed(),
    difference: variance.difference.toFixed(),
    executed: variance.executed === null ? null : variance.executed.toString(),
    status: variance.status,
  };
}

function toResponse(budget: Budget): BudgetResponse {
  return {
    year: budget.year,
    month: budget.month,
    lines: budget.lines.map((line) => ({
      categoryId: line.categoryId,
      type: line.type,
      plannedAmount: line.planned.toFixed(),
      currency: line.planned.currency,
    })),
    summary: budget.summary.map((report) => ({
      type: report.type,
      currency: report.currency,
      lines: report.lines.map((line) => ({ categoryId: line.categoryId, ...varianceOf(line) })),
      unbudgeted: report.unbudgeted.map((entry) => ({
        categoryId: entry.categoryId,
        amount: entry.amount.toFixed(),
      })),
      total: varianceOf(report.total),
    })),
  };
}

/**
 * El presupuesto de un mes: sus partidas, por categoría madre y moneda. El año y el mes de la
 * ruta dicen **qué** mes, nunca de quién: la cuenta sale del token.
 *
 * Solo desde una sesión; un token personal recibe 403.
 */
@Controller('budgets')
@RequiresFeature('budgeting')
@UseGuards(AccessTokenGuard)
export class BudgetsController {
  constructor(
    private readonly getBudget: GetBudget,
    private readonly replaceBudget: ReplaceBudget,
    private readonly copyPrevious: CopyPreviousBudget,
  ) {}

  /** Un mes sin presupuesto responde 200 con `lines: []`: no haberlo armado no es un error. */
  @Get(':year/:month')
  async get(
    @CurrentUser() userId: string,
    @Param(new ZodValidationPipe(budgetMonthParamsSchema)) params: BudgetMonthParams,
  ): Promise<BudgetResponse> {
    return toResponse(await this.getBudget.execute({ userId, ...params }));
  }

  /** Reemplaza todas las partidas del mes; `lines: []` lo vacía. */
  @Put(':year/:month')
  async put(
    @CurrentUser() userId: string,
    @Param(new ZodValidationPipe(budgetMonthParamsSchema)) params: BudgetMonthParams,
    @Body(new ZodValidationPipe(putBudgetRequestSchema)) body: PutBudgetRequest,
  ): Promise<BudgetResponse> {
    return toResponse(await this.replaceBudget.execute({ userId, ...params }, body.lines));
  }

  /**
   * Copia las partidas del mes anterior (o del último con presupuesto) que el mes no tiene: nunca
   * pisa una. Responde 200 aunque no haya de dónde copiar (`copiedFrom: null`): no es un error.
   */
  @Post(':year/:month/copy-from-previous')
  @HttpCode(200)
  async copy(
    @CurrentUser() userId: string,
    @Param(new ZodValidationPipe(budgetMonthParamsSchema)) params: BudgetMonthParams,
  ): Promise<CopiedBudgetResponse> {
    const copied: CopiedBudget = await this.copyPrevious.execute({ userId, ...params });

    return { ...toResponse(copied), copiedFrom: copied.copiedFrom, skipped: copied.skipped };
  }
}
