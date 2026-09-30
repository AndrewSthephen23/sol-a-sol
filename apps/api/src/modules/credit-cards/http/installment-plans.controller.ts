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
  type CreateInstallmentPlanRequest,
  createInstallmentPlanRequestSchema,
  type CreditCardParams,
  creditCardParamsSchema,
  type InstallmentPlanParams,
  installmentPlanParamsSchema,
} from '@sol-a-sol/contracts';
import type { Installment, Money } from '@sol-a-sol/domain';

import { RequiresFeature } from '../../../shared/feature-flags/feature-flag.guard.js';
import { ZodValidationPipe } from '../../../shared/http/zod-validation.pipe.js';
import { AccessTokenGuard, CurrentUser } from '../../identity/index.js';
import {
  CreateInstallmentPlan,
  DeleteInstallmentPlan,
  type InstallmentPlanView,
  ListInstallmentPlans,
} from '../application/installment-plans.js';

interface MoneyResponse {
  amount: string;
  currency: string;
}

interface InstallmentResponse {
  number: number;
  amount: MoneyResponse;
  statementDate: string;
  /** Ya entró en un estado de cuenta (el de hoy incluido). */
  billed: boolean;
}

/** Un plan de cuotas como está hoy. Montos como string decimal, nunca número. */
export interface InstallmentPlanResponse {
  id: string;
  transactionId: string;
  count: number;
  state: string;
  /** `null` si la compra se borró. */
  purchase: { date: string; description: string; amount: MoneyResponse } | null;
  total: MoneyResponse | null;
  interest: MoneyResponse | null;
  installments: InstallmentResponse[];
  pending: { count: number; amount: MoneyResponse } | null;
}

function moneyOf(money: Money): MoneyResponse {
  return { amount: money.toFixed(), currency: money.currency };
}

function toResponse(view: InstallmentPlanView): InstallmentPlanResponse {
  const pending = new Set(view.pending.map((item) => item.number));
  const pendingAmount = view.pending.reduce<Money | null>(
    (sum, item) => (sum === null ? item.amount : sum.add(item.amount)),
    null,
  );
  const installmentOf = (item: Installment): InstallmentResponse => ({
    number: item.number,
    amount: moneyOf(item.amount),
    statementDate: item.statementDate.toString(),
    billed: !pending.has(item.number),
  });

  return {
    id: view.plan.id,
    transactionId: view.plan.transactionId,
    count: view.plan.count,
    state: view.state,
    purchase:
      view.purchase === null
        ? null
        : {
            date: view.purchase.date.toString(),
            description: view.purchase.description,
            amount: moneyOf(view.purchase.amount),
          },
    total: view.total === null ? null : moneyOf(view.total),
    interest: view.interest === null ? null : moneyOf(view.interest),
    installments: view.installments.map(installmentOf),
    pending:
      pendingAmount === null
        ? null
        : { count: view.pending.length, amount: moneyOf(pendingAmount) },
  };
}

/**
 * Las compras en cuotas de una tarjeta. El plan **sigue a la compra**: se lee como está hoy, así
 * que corregirla o borrarla no deja un plan huérfano. Solo desde una sesión; un token personal
 * recibe 403.
 */
@Controller('credit-cards/:id/installments')
@RequiresFeature('credit-cards')
@UseGuards(AccessTokenGuard)
export class InstallmentPlansController {
  constructor(
    private readonly listPlans: ListInstallmentPlans,
    private readonly createPlan: CreateInstallmentPlan,
    private readonly deletePlan: DeleteInstallmentPlan,
  ) {}

  @Get()
  async list(
    @CurrentUser() userId: string,
    @Param(new ZodValidationPipe(creditCardParamsSchema)) params: CreditCardParams,
  ): Promise<InstallmentPlanResponse[]> {
    return (await this.listPlans.execute(userId, params.id)).map(toResponse);
  }

  @Post()
  async create(
    @CurrentUser() userId: string,
    @Param(new ZodValidationPipe(creditCardParamsSchema)) params: CreditCardParams,
    @Body(new ZodValidationPipe(createInstallmentPlanRequestSchema))
    body: CreateInstallmentPlanRequest,
  ): Promise<InstallmentPlanResponse> {
    return toResponse(
      await this.createPlan.execute(userId, params.id, {
        transactionId: body.transactionId,
        count: body.count,
        totalAmount: body.totalAmount ?? null,
      }),
    );
  }

  /** Deshace el plan: la compra vuelve a pagarse entera en su estado de cuenta. */
  @Delete(':planId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @CurrentUser() userId: string,
    @Param(new ZodValidationPipe(installmentPlanParamsSchema)) params: InstallmentPlanParams,
  ): Promise<void> {
    await this.deletePlan.execute(userId, params.id, params.planId);
  }
}
