import { Injectable } from '@nestjs/common';
import { type CreditCardSettings, Money, type PaymentDueRule } from '@sol-a-sol/domain';

import { fromDatabaseDate, toDatabaseDate } from '../../../shared/prisma/database-date.js';
import { PrismaService } from '../../../shared/prisma/prisma.service.js';
import { CreditCardAlreadyConfiguredError } from '../domain/errors.js';
import type { CreditCard, CreditCardRepository } from '../ports/credit-card-repository.js';

/** Prisma señala la violación de una restricción única con este código. */
const UNIQUE_VIOLATION = 'P2002';

/** `select` explícito: `userId` no sale del módulo. */
const CARD_FIELDS = {
  id: true,
  paymentMethodId: true,
  creditLimit: true,
  creditLimitCurrency: true,
  statementDay: true,
  paymentDueRule: true,
  dueDaysAfterStatement: true,
  dueDayOfMonth: true,
  openingBalancePen: true,
  openingBalanceUsd: true,
  openingBalanceDate: true,
} as const;

interface CardRow {
  id: string;
  paymentMethodId: string;
  creditLimit: { toFixed(decimals: number): string };
  creditLimitCurrency: 'PEN' | 'USD';
  statementDay: number;
  paymentDueRule: PaymentDueRule['kind'];
  dueDaysAfterStatement: number | null;
  dueDayOfMonth: number | null;
  openingBalancePen: { toFixed(decimals: number): string } | null;
  openingBalanceUsd: { toFixed(decimals: number): string } | null;
  openingBalanceDate: Date | null;
}

@Injectable()
export class PrismaCreditCardRepository implements CreditCardRepository {
  constructor(private readonly prisma: PrismaService) {}

  async list(userId: string): Promise<CreditCard[]> {
    const rows = await this.prisma.creditCard.findMany({
      where: { userId },
      select: CARD_FIELDS,
      // Los ids son UUID v7: ordenarlos es ordenar por cuándo se configuraron.
      orderBy: { id: 'asc' },
    });

    return rows.map(cardOf);
  }

  async find(userId: string, id: string): Promise<CreditCard | null> {
    const row = await this.prisma.creditCard.findFirst({
      where: { id, userId },
      select: CARD_FIELDS,
    });

    return row === null ? null : cardOf(row);
  }

  async create(
    userId: string,
    paymentMethodId: string,
    settings: CreditCardSettings,
  ): Promise<CreditCard> {
    try {
      const row = await this.prisma.creditCard.create({
        data: { userId, paymentMethodId, ...columnsOf(settings) },
        select: CARD_FIELDS,
      });

      return cardOf(row);
    } catch (error) {
      // El índice único de `payment_method_id` es el que decide: dos peticiones a la vez no se
      // cuelan.
      if (isUniqueViolation(error)) throw new CreditCardAlreadyConfiguredError();
      throw error;
    }
  }

  async update(
    userId: string,
    id: string,
    settings: CreditCardSettings,
  ): Promise<CreditCard | null> {
    // `userId` va en el propio UPDATE: aunque alguien adivine el id de una tarjeta ajena, la fila
    // no coincide y no se toca.
    const { count } = await this.prisma.creditCard.updateMany({
      where: { id, userId },
      data: columnsOf(settings),
    });
    if (count === 0) return null;

    return this.find(userId, id);
  }
}

/** La configuración en columnas: cada regla con su dato, y el saldo inicial una columna por moneda. */
function columnsOf(settings: CreditCardSettings) {
  const { creditLimit, paymentDueRule: rule, openingBalance } = settings;
  const amountIn = (currency: 'PEN' | 'USD') =>
    openingBalance?.amounts.find((amount) => amount.currency === currency)?.toFixed() ?? null;

  return {
    creditLimit: creditLimit.toFixed(),
    creditLimitCurrency: creditLimit.currency,
    statementDay: settings.statementDay,
    paymentDueRule: rule.kind,
    dueDaysAfterStatement: rule.kind === 'DAYS_AFTER_STATEMENT' ? rule.days : null,
    dueDayOfMonth: rule.kind === 'DAY_OF_MONTH' ? rule.day : null,
    openingBalancePen: amountIn('PEN'),
    openingBalanceUsd: amountIn('USD'),
    openingBalanceDate: openingBalance === null ? null : toDatabaseDate(openingBalance.date),
  };
}

function cardOf(row: CardRow): CreditCard {
  // Los `CHECK` de la migración garantizan que cada regla trae su dato.
  const paymentDueRule: PaymentDueRule =
    row.paymentDueRule === 'DAYS_AFTER_STATEMENT'
      ? { kind: row.paymentDueRule, days: row.dueDaysAfterStatement ?? 0 }
      : { kind: row.paymentDueRule, day: row.dueDayOfMonth ?? 0 };
  const amounts = [
    row.openingBalancePen === null ? null : Money.of(row.openingBalancePen.toFixed(2), 'PEN'),
    row.openingBalanceUsd === null ? null : Money.of(row.openingBalanceUsd.toFixed(2), 'USD'),
  ].filter((amount) => amount !== null);

  return {
    id: row.id,
    paymentMethodId: row.paymentMethodId,
    creditLimit: Money.of(row.creditLimit.toFixed(2), row.creditLimitCurrency),
    statementDay: row.statementDay,
    paymentDueRule,
    openingBalance:
      row.openingBalanceDate === null
        ? null
        : { date: fromDatabaseDate(row.openingBalanceDate), amounts },
  };
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === UNIQUE_VIOLATION
  );
}
