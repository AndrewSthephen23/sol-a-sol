import { Injectable } from '@nestjs/common';
import type { Currency, TransactionType } from '@sol-a-sol/domain';

import { fromDatabaseDate, toDatabaseDate } from '../../../shared/prisma/database-date.js';
import { PrismaService } from '../../../shared/prisma/prisma.service.js';
import {
  type Capture,
  type CaptureRepository,
  type CaptureSource,
  IdempotencyKeyTakenError,
  type NewCapture,
} from '../ports/capture-repository.js';

/** Prisma señala la violación de una restricción única con este código. */
const UNIQUE_VIOLATION = 'P2002';

/** `select` explícito: ni `userId` ni el pedido crudo salen del módulo por aquí. */
const CAPTURE_FIELDS = {
  id: true,
  source: true,
  status: true,
  type: true,
  occurredAt: true,
  businessDate: true,
  amount: true,
  currency: true,
  merchant: true,
  cardLast4: true,
  description: true,
  categoryId: true,
  paymentMethodId: true,
  warnings: true,
  createdAt: true,
} as const;

interface CaptureRow {
  id: string;
  source: CaptureSource;
  status: Capture['status'];
  type: TransactionType;
  occurredAt: Date;
  businessDate: Date;
  amount: { toFixed(decimals: number): string } | null;
  currency: Currency | null;
  merchant: string | null;
  cardLast4: string | null;
  description: string | null;
  categoryId: string | null;
  paymentMethodId: string | null;
  warnings: string[];
  createdAt: Date;
}

@Injectable()
export class PrismaCaptureRepository implements CaptureRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findByIdempotencyKey(userId: string, key: string): Promise<Capture | null> {
    const row = await this.prisma.capture.findFirst({
      where: { userId, idempotencyKey: key },
      select: CAPTURE_FIELDS,
    });

    return row === null ? null : captureOf(row);
  }

  async create(userId: string, capture: NewCapture): Promise<Capture> {
    try {
      const row = await this.prisma.capture.create({
        data: {
          userId,
          source: capture.source,
          rawPayload: capture.rawPayload,
          occurredAt: capture.occurredAt,
          businessDate: toDatabaseDate(capture.businessDate),
          type: capture.type,
          amount: capture.amount?.value ?? null,
          currency: capture.amount?.currency ?? null,
          merchant: capture.merchant,
          cardLast4: capture.cardLast4,
          description: capture.description,
          categoryId: capture.categoryId,
          paymentMethodId: capture.paymentMethodId,
          idempotencyKey: capture.idempotencyKey,
          warnings: capture.warnings,
          status: capture.status,
        },
        select: CAPTURE_FIELDS,
      });
      return captureOf(row);
    } catch (error) {
      // La única restricción única que puede chocar al crear es `(user_id, idempotency_key)`.
      if (isUniqueViolation(error)) throw new IdempotencyKeyTakenError();
      throw error;
    }
  }

  async listOccurredBetween(userId: string, from: Date, to: Date): Promise<Capture[]> {
    const rows = await this.prisma.capture.findMany({
      where: { userId, occurredAt: { gte: from, lte: to } },
      select: CAPTURE_FIELDS,
    });

    return rows.map(captureOf);
  }
}

function captureOf(row: CaptureRow): Capture {
  const { amount, currency, businessDate, ...fields } = row;

  return {
    ...fields,
    businessDate: fromDatabaseDate(businessDate),
    amount: amount === null ? null : { value: amount.toFixed(2), currency },
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
