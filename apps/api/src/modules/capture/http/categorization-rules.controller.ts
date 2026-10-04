import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  type CategorizationRuleParams,
  categorizationRuleParamsSchema,
  type CreateCategorizationRuleRequest,
  createCategorizationRuleRequestSchema,
  type UpdateCategorizationRuleRequest,
  updateCategorizationRuleRequestSchema,
} from '@sol-a-sol/contracts';

import { RequiresFeature } from '../../../shared/feature-flags/feature-flag.guard.js';
import { ZodValidationPipe } from '../../../shared/http/zod-validation.pipe.js';
import { AccessTokenGuard, CurrentUser } from '../../identity/index.js';
import {
  CreateCategorizationRule,
  DeleteCategorizationRule,
  ListCategorizationRules,
  UpdateCategorizationRule,
} from '../application/rules.js';
import type { CategorizationRule } from '../ports/categorization-rule-repository.js';

/** Lo que viaja: la regla como se escribió. La clave sin tildes es cosa de la base. */
export interface CategorizationRuleResponse {
  id: string;
  pattern: string;
  categoryId: string;
  priority: number;
}

function ruleResponse(rule: CategorizationRule): CategorizationRuleResponse {
  return {
    id: rule.id,
    pattern: rule.pattern,
    categoryId: rule.categoryId,
    priority: rule.priority,
  };
}

/** Las reglas de categorización de la bandeja. Solo desde una sesión. */
@Controller('categorization-rules')
@RequiresFeature('capture')
@UseGuards(AccessTokenGuard)
export class CategorizationRulesController {
  constructor(
    private readonly listRules: ListCategorizationRules,
    private readonly createRule: CreateCategorizationRule,
    private readonly updateRule: UpdateCategorizationRule,
    private readonly deleteRule: DeleteCategorizationRule,
  ) {}

  @Get()
  async list(@CurrentUser() userId: string): Promise<CategorizationRuleResponse[]> {
    return (await this.listRules.execute(userId)).map(ruleResponse);
  }

  @Post()
  async create(
    @CurrentUser() userId: string,
    @Body(new ZodValidationPipe(createCategorizationRuleRequestSchema))
    body: CreateCategorizationRuleRequest,
  ): Promise<CategorizationRuleResponse> {
    return ruleResponse(await this.createRule.execute(userId, body));
  }

  @Patch(':id')
  async update(
    @CurrentUser() userId: string,
    @Param(new ZodValidationPipe(categorizationRuleParamsSchema)) params: CategorizationRuleParams,
    @Body(new ZodValidationPipe(updateCategorizationRuleRequestSchema))
    body: UpdateCategorizationRuleRequest,
  ): Promise<CategorizationRuleResponse> {
    return ruleResponse(await this.updateRule.execute(userId, params.id, body));
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(
    @CurrentUser() userId: string,
    @Param(new ZodValidationPipe(categorizationRuleParamsSchema)) params: CategorizationRuleParams,
  ): Promise<void> {
    await this.deleteRule.execute(userId, params.id);
  }
}
