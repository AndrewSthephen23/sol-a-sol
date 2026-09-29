import { Body, Controller, Get, Param, Put, UseGuards } from '@nestjs/common';
import {
  type BudgetMonthParams,
  budgetMonthParamsSchema,
  type PutBudgetRequest,
  putBudgetRequestSchema,
} from '@sol-a-sol/contracts';

import { RequiresFeature } from '../../../shared/feature-flags/feature-flag.guard.js';
import { ZodValidationPipe } from '../../../shared/http/zod-validation.pipe.js';
import { AccessTokenGuard, CurrentUser } from '../../identity/index.js';
import { type Budget, GetBudget, ReplaceBudget } from '../application/budgets.js';

/** Lo que viaja: el monto planeado como **string decimal**, nunca como número. */
export interface BudgetResponse {
  year: number;
  month: number;
  lines: { categoryId: string; type: string; plannedAmount: string; currency: string }[];
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
}
