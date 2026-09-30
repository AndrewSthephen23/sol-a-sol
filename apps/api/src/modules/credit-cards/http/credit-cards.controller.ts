import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import {
  type CreateCreditCardRequest,
  createCreditCardRequestSchema,
  type CreditCardParams,
  creditCardParamsSchema,
  type MoneyRequest,
  type OpeningBalanceRequest,
  type UpdateCreditCardRequest,
  updateCreditCardRequestSchema,
} from '@sol-a-sol/contracts';
import {
  type CreditCardSettings,
  LocalDate,
  Money,
  type OpeningBalance,
  type PaymentDueRule,
} from '@sol-a-sol/domain';

import { RequiresFeature } from '../../../shared/feature-flags/feature-flag.guard.js';
import { ZodValidationPipe } from '../../../shared/http/zod-validation.pipe.js';
import { AccessTokenGuard, CurrentUser } from '../../identity/index.js';
import {
  ConfigureCreditCard,
  type CreditCardView,
  ListCreditCards,
  UpdateCreditCard,
} from '../application/credit-cards.js';

interface MoneyResponse {
  /** String decimal con 2 decimales, nunca número. */
  amount: string;
  currency: string;
}

/** Lo que viaja: la tarjeta con lo que la identifica, y los montos como string decimal. */
export interface CreditCardResponse {
  id: string;
  paymentMethod: {
    id: string;
    alias: string;
    institution: string | null;
    last4: string | null;
    currency: string | null;
    archived: boolean;
  };
  creditLimit: MoneyResponse;
  statementDay: number;
  paymentDueRule: PaymentDueRule;
  openingBalance: { date: string; amounts: MoneyResponse[] } | null;
}

function moneyOf(money: Money): MoneyResponse {
  return { amount: money.toFixed(), currency: money.currency };
}

function toResponse({ card, paymentMethod }: CreditCardView): CreditCardResponse {
  return {
    id: card.id,
    paymentMethod: {
      id: paymentMethod.id,
      alias: paymentMethod.alias,
      institution: paymentMethod.institution,
      last4: paymentMethod.last4,
      currency: paymentMethod.currency,
      archived: paymentMethod.archived,
    },
    creditLimit: moneyOf(card.creditLimit),
    statementDay: card.statementDay,
    paymentDueRule: card.paymentDueRule,
    openingBalance:
      card.openingBalance === null
        ? null
        : {
            date: card.openingBalance.date.toString(),
            amounts: card.openingBalance.amounts.map(moneyOf),
          },
  };
}

function toMoney(money: MoneyRequest): Money {
  return Money.of(money.amount, money.currency);
}

function toOpeningBalance(balance: OpeningBalanceRequest | null): OpeningBalance | null {
  if (balance === null) return null;

  return { date: LocalDate.parse(balance.date), amounts: balance.amounts.map(toMoney) };
}

function toSettings(body: CreateCreditCardRequest): CreditCardSettings {
  return {
    creditLimit: toMoney(body.creditLimit),
    statementDay: body.statementDay,
    paymentDueRule: body.paymentDueRule,
    openingBalance: toOpeningBalance(body.openingBalance ?? null),
  };
}

/** Solo lo que llegó: una clave ausente no cambia nada, y `openingBalance: null` lo quita. */
function toChanges(body: UpdateCreditCardRequest): Partial<CreditCardSettings> {
  return {
    ...(body.creditLimit === undefined ? {} : { creditLimit: toMoney(body.creditLimit) }),
    ...(body.statementDay === undefined ? {} : { statementDay: body.statementDay }),
    ...(body.paymentDueRule === undefined ? {} : { paymentDueRule: body.paymentDueRule }),
    ...(body.openingBalance === undefined
      ? {}
      : { openingBalance: toOpeningBalance(body.openingBalance) }),
  };
}

/**
 * Las tarjetas de crédito: lo que el método de pago no tiene (línea, día de corte, regla de pago y
 * saldo inicial). La cuenta sale del token; el id de la ruta dice **qué** tarjeta, nunca de quién.
 *
 * **Sin `DELETE`:** para dejar de usar una tarjeta se archiva su método de pago, y su
 * configuración se conserva. Solo desde una sesión; un token personal recibe 403.
 */
@Controller('credit-cards')
@RequiresFeature('credit-cards')
@UseGuards(AccessTokenGuard)
export class CreditCardsController {
  constructor(
    private readonly listCards: ListCreditCards,
    private readonly configureCard: ConfigureCreditCard,
    private readonly updateCard: UpdateCreditCard,
  ) {}

  /** Las configuradas, archivadas incluidas, en el orden en que se configuraron. */
  @Get()
  async list(@CurrentUser() userId: string): Promise<CreditCardResponse[]> {
    return (await this.listCards.execute(userId)).map(toResponse);
  }

  @Post()
  async create(
    @CurrentUser() userId: string,
    @Body(new ZodValidationPipe(createCreditCardRequestSchema)) body: CreateCreditCardRequest,
  ): Promise<CreditCardResponse> {
    return toResponse(
      await this.configureCard.execute(userId, body.paymentMethodId, toSettings(body)),
    );
  }

  @Patch(':id')
  async update(
    @CurrentUser() userId: string,
    @Param(new ZodValidationPipe(creditCardParamsSchema)) params: CreditCardParams,
    @Body(new ZodValidationPipe(updateCreditCardRequestSchema)) body: UpdateCreditCardRequest,
  ): Promise<CreditCardResponse> {
    return toResponse(await this.updateCard.execute(userId, params.id, toChanges(body)));
  }
}
