import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  type CreateGoalContributionRequest,
  createGoalContributionRequestSchema,
  type GoalContributionParams,
  goalContributionParamsSchema,
  type GoalParams,
  goalParamsSchema,
} from '@sol-a-sol/contracts';
import { LocalDate } from '@sol-a-sol/domain';

import { RequiresFeature } from '../../../shared/feature-flags/feature-flag.guard.js';
import { ZodValidationPipe } from '../../../shared/http/zod-validation.pipe.js';
import { AccessTokenGuard, CurrentUser } from '../../identity/index.js';
import {
  AddGoalContribution,
  DeleteGoalContribution,
  ListGoalContributions,
} from '../application/goal-contributions.js';
import type { GoalContributionView } from '../application/goal-views.js';

/** Un aporte como está hoy. El monto, string decimal en la moneda de la meta. */
export interface GoalContributionResponse {
  id: string;
  source: 'MANUAL' | 'TRANSACTION';
  kind: string;
  /** Solo cuenta un aporte `ACTIVE`; uno enlazado deja de contar si su transacción cambia. */
  state: string;
  /** `null` si la transacción enlazada se borró. */
  amount: string | null;
  date: string | null;
  /** La transacción que sigue, si es enlazado y sigue vigente. */
  transaction: { id: string; description: string } | null;
}

function contributionResponse(view: GoalContributionView): GoalContributionResponse {
  return {
    id: view.contribution.id,
    source: view.contribution.source,
    kind: view.kind,
    state: view.state,
    amount: view.amount?.toFixed() ?? null,
    date: view.date?.toString() ?? null,
    transaction:
      view.transaction === null
        ? null
        : { id: view.transaction.id, description: view.transaction.description },
  };
}

/**
 * Los aportes y retiros de una meta. Un aporte enlazado **sigue a su transacción**: se lee como
 * está hoy, así que corregirla o borrarla no deja la meta desviada. Solo desde una sesión; un
 * token personal recibe 403.
 */
@Controller('goals/:id/contributions')
@RequiresFeature('goals')
@UseGuards(AccessTokenGuard)
export class GoalContributionsController {
  constructor(
    private readonly listContributions: ListGoalContributions,
    private readonly addContribution: AddGoalContribution,
    private readonly deleteContribution: DeleteGoalContribution,
  ) {}

  @Get()
  async list(
    @CurrentUser() userId: string,
    @Param(new ZodValidationPipe(goalParamsSchema)) params: GoalParams,
  ): Promise<GoalContributionResponse[]> {
    return (await this.listContributions.execute(userId, params.id)).map(contributionResponse);
  }

  @Post()
  async create(
    @CurrentUser() userId: string,
    @Param(new ZodValidationPipe(goalParamsSchema)) params: GoalParams,
    @Body(new ZodValidationPipe(createGoalContributionRequestSchema))
    body: CreateGoalContributionRequest,
  ): Promise<GoalContributionResponse> {
    return contributionResponse(
      await this.addContribution.execute(
        userId,
        params.id,
        body.source === 'MANUAL'
          ? { ...body, date: LocalDate.parse(body.date) }
          : { source: 'TRANSACTION', transactionId: body.transactionId },
      ),
    );
  }

  /** Deshace un aporte o un retiro. */
  @Delete(':contributionId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @CurrentUser() userId: string,
    @Param(new ZodValidationPipe(goalContributionParamsSchema)) params: GoalContributionParams,
  ): Promise<void> {
    await this.deleteContribution.execute(userId, params.id, params.contributionId);
  }
}
