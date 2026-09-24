import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../../shared/prisma/prisma.service.js';
import { PaymentMethodAliasTakenError } from '../domain/errors.js';
import type {
  NewPaymentMethod,
  PaymentMethod,
  PaymentMethodChanges,
  PaymentMethodRepository,
} from '../ports/payment-method-repository.js';

/** Prisma señala la violación de una restricción única con este código. */
const UNIQUE_VIOLATION = 'P2002';

/** `select` explícito: `userId` no sale en las respuestas. */
const PUBLIC_FIELDS = {
  id: true,
  kind: true,
  alias: true,
  institution: true,
  last4: true,
  currency: true,
  archivedAt: true,
  createdAt: true,
  updatedAt: true,
} as const;

@Injectable()
export class PrismaPaymentMethodRepository implements PaymentMethodRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(method: NewPaymentMethod): Promise<PaymentMethod> {
    return aliasMustBeFree(() =>
      this.prisma.paymentMethod.create({ data: method, select: PUBLIC_FIELDS }),
    );
  }

  async list(userId: string, options: { includeArchived: boolean }): Promise<PaymentMethod[]> {
    return this.prisma.paymentMethod.findMany({
      where: { userId, ...(options.includeArchived ? {} : { archivedAt: null }) },
      select: PUBLIC_FIELDS,
      // El id desempata y deja el orden estable entre consultas.
      orderBy: [{ alias: 'asc' }, { id: 'asc' }],
    });
  }

  async find(userId: string, id: string): Promise<PaymentMethod | null> {
    return this.prisma.paymentMethod.findFirst({ where: { id, userId }, select: PUBLIC_FIELDS });
  }

  async update(
    userId: string,
    id: string,
    changes: PaymentMethodChanges,
  ): Promise<PaymentMethod | null> {
    // `userId` va en el propio UPDATE: aunque alguien adivine el id de un método ajeno, la fila
    // no coincide y no se toca.
    const { count } = await aliasMustBeFree(() =>
      this.prisma.paymentMethod.updateMany({ where: { id, userId }, data: changes }),
    );
    if (count === 0) return null;

    return this.find(userId, id);
  }
}

/** El índice `payment_methods_unique_alias` es el que decide: dos peticiones a la vez no se cuelan. */
async function aliasMustBeFree<T>(write: () => Promise<T>): Promise<T> {
  try {
    return await write();
  } catch (error) {
    if (isUniqueViolation(error)) throw new PaymentMethodAliasTakenError();
    throw error;
  }
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === UNIQUE_VIOLATION
  );
}
