import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import {
  type CreateGoalRequest,
  createGoalRequestSchema,
  type GoalParams,
  goalParamsSchema,
  type ListGoalsQuery,
  listGoalsQuerySchema,
  type UpdateGoalRequest,
  updateGoalRequestSchema,
} from '@sol-a-sol/contracts';
import { LocalDate, Money } from '@sol-a-sol/domain';

import { RequiresFeature } from '../../../shared/feature-flags/feature-flag.guard.js';
import { ZodValidationPipe } from '../../../shared/http/zod-validation.pipe.js';
import { AccessTokenGuard, CurrentUser } from '../../identity/index.js';
import type { GoalView } from '../application/goal-views.js';
import { CreateGoal, ListGoals, UpdateGoal } from '../application/goals.js';

/**
 * Lo que viaja: la meta y su progreso, calculado al consultar. Montos como string decimal en la
 * moneda de la meta; los porcentajes, sin redondear.
 */
export interface GoalResponse {
  id: string;
  name: string;
  currency: string;
  targetAmount: string;
  startDate: string;
  endDate: string;
  archived: boolean;
  progress: {
    saved: string;
    remaining: string;
    excess: string;
    percentage: string;
    expectedPercentage: string;
    /** `null` con la fecha fin pasada. */
    suggestedMonthly: string | null;
    status: string;
  };
}

export function goalResponse({ goal, progress }: GoalView): GoalResponse {
  return {
    id: goal.id,
    name: goal.name,
    currency: goal.target.currency,
    targetAmount: goal.target.toFixed(),
    startDate: goal.startDate.toString(),
    endDate: goal.endDate.toString(),
    archived: goal.archivedAt !== null,
    progress: {
      saved: progress.saved.toFixed(),
      remaining: progress.remaining.toFixed(),
      excess: progress.excess.toFixed(),
      percentage: progress.percentage.toString(),
      expectedPercentage: progress.expectedPercentage.toString(),
      suggestedMonthly: progress.suggestedMonthly?.toFixed() ?? null,
      status: progress.status,
    },
  };
}

/** Las metas de ahorro de la cuenta. Solo desde una sesión; un token personal recibe 403. */
@Controller('goals')
@RequiresFeature('goals')
@UseGuards(AccessTokenGuard)
export class GoalsController {
  constructor(
    private readonly listGoals: ListGoals,
    private readonly createGoal: CreateGoal,
    private readonly updateGoal: UpdateGoal,
  ) {}

  @Get()
  async list(
    @CurrentUser() userId: string,
    @Query(new ZodValidationPipe(listGoalsQuerySchema)) query: ListGoalsQuery,
  ): Promise<GoalResponse[]> {
    return (await this.listGoals.execute(userId, query)).map(goalResponse);
  }

  @Post()
  async create(
    @CurrentUser() userId: string,
    @Body(new ZodValidationPipe(createGoalRequestSchema)) body: CreateGoalRequest,
  ): Promise<GoalResponse> {
    return goalResponse(
      await this.createGoal.execute(userId, {
        name: body.name,
        target: Money.of(body.targetAmount, body.currency),
        startDate: LocalDate.parse(body.startDate),
        endDate: LocalDate.parse(body.endDate),
      }),
    );
  }

  @Patch(':id')
  async update(
    @CurrentUser() userId: string,
    @Param(new ZodValidationPipe(goalParamsSchema)) params: GoalParams,
    @Body(new ZodValidationPipe(updateGoalRequestSchema)) body: UpdateGoalRequest,
  ): Promise<GoalResponse> {
    const { startDate, endDate, ...rest } = body;

    return goalResponse(
      await this.updateGoal.execute(userId, params.id, {
        ...rest,
        ...(startDate === undefined ? {} : { startDate: LocalDate.parse(startDate) }),
        ...(endDate === undefined ? {} : { endDate: LocalDate.parse(endDate) }),
      }),
    );
  }
}
