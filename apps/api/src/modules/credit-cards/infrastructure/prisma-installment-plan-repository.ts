import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../../shared/prisma/prisma.service.js';
import { InstallmentPlanAlreadyExistsError } from '../domain/errors.js';
import type {
  InstallmentPlanRepository,
  NewInstallmentPlan,
  StoredInstallmentPlan,
} from '../ports/installment-plan-repository.js';

/** Prisma señala la violación de una restricción única con este código. */
const UNIQUE_VIOLATION = 'P2002';

/** `select` explícito: `userId` no sale del módulo. */
const PLAN_FIELDS = {
  id: true,
  creditCardId: true,
  transactionId: true,
  count: true,
  totalAmount: true,
} as const;

interface PlanRow {
  id: string;
  creditCardId: string;
  transactionId: string;
  count: number;
  totalAmount: { toFixed(decimals: number): string } | null;
}

@Injectable()
export class PrismaInstallmentPlanRepository implements InstallmentPlanRepository {
  constructor(private readonly prisma: PrismaService) {}

  async listByCard(userId: string, creditCardId: string): Promise<StoredInstallmentPlan[]> {
    const rows = await this.prisma.installmentPlan.findMany({
      where: { userId, creditCardId },
      select: PLAN_FIELDS,
      // Los ids son UUID v7: ordenarlos es ordenar por cuándo se registraron.
      orderBy: { id: 'asc' },
    });

    return rows.map(planOf);
  }

  async create(userId: string, plan: NewInstallmentPlan): Promise<StoredInstallmentPlan> {
    try {
      const row = await this.prisma.installmentPlan.create({
        data: { userId, ...plan },
        select: PLAN_FIELDS,
      });

      return planOf(row);
    } catch (error) {
      // El índice único de `transaction_id` es el que decide: dos peticiones a la vez no se cuelan.
      if (isUniqueViolation(error)) throw new InstallmentPlanAlreadyExistsError();
      throw error;
    }
  }

  async delete(userId: string, creditCardId: string, id: string): Promise<boolean> {
    // `userId` y la tarjeta van en el propio DELETE: un id ajeno no coincide con ninguna fila.
    const { count } = await this.prisma.installmentPlan.deleteMany({
      where: { id, userId, creditCardId },
    });

    return count > 0;
  }
}

function planOf(row: PlanRow): StoredInstallmentPlan {
  return {
    id: row.id,
    creditCardId: row.creditCardId,
    transactionId: row.transactionId,
    count: row.count,
    totalAmount: row.totalAmount?.toFixed(2) ?? null,
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
