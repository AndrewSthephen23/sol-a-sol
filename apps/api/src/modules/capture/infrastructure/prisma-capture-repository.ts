import { Injectable } from '@nestjs/common';
import type { Currency, TransactionType } from '@sol-a-sol/domain';

import { Prisma } from '../../../generated/prisma/client.js';
import { fromDatabaseDate, toDatabaseDate } from '../../../shared/prisma/database-date.js';
import { PrismaService } from '../../../shared/prisma/prisma.service.js';
import {
  type Capture,
  type CaptureChanges,
  type CapturePosition,
  type CaptureRepository,
  type CaptureSource,
  IdempotencyKeyTakenError,
  type NewCapture,
} from '../ports/capture-repository.js';

/** Prisma señala la violación de una restricción única con este código. */
const UNIQUE_VIOLATION = 'P2002';

/** `select` explícito: `userId` no sale del módulo. */
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
  rawPayload: true,
  discardedAt: true,
  discardedFrom: true,
  transactionId: true,
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
  rawPayload: Prisma.JsonValue;
  discardedAt: Date | null;
  discardedFrom: Capture['status'] | null;
  transactionId: string | null;
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

  async find(userId: string, id: string): Promise<Capture | null> {
    const row = await this.prisma.capture.findFirst({
      where: { id, userId },
      select: CAPTURE_FIELDS,
    });

    return row === null ? null : captureOf(row);
  }

  async list(
    userId: string,
    statuses: readonly Capture['status'][],
    page: { after: CapturePosition | null; limit: number },
  ): Promise<Capture[]> {
    const { after } = page;
    const rows = await this.prisma.capture.findMany({
      where: {
        userId,
        status: { in: [...statuses] },
        // Después de la última entregada: más antigua, o del mismo instante con un id menor.
        ...(after === null
          ? {}
          : {
              OR: [
                { occurredAt: { lt: after.occurredAt } },
                { occurredAt: after.occurredAt, id: { lt: after.id } },
              ],
            }),
      },
      select: CAPTURE_FIELDS,
      orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
      take: page.limit,
    });

    return rows.map(captureOf);
  }

  async update(
    userId: string,
    id: string,
    changes: CaptureChanges,
    expected: readonly Capture['status'][],
  ): Promise<Capture | null> {
    // `userId` y el estado esperado van en el propio UPDATE: una captura ajena no coincide, y una
    // que otra petición confirmó o descartó entretanto, tampoco.
    const { count } = await this.prisma.capture.updateMany({
      where: { id, userId, status: { in: [...expected] } },
      data: dataOf(changes),
    });
    if (count === 0) return null;

    return this.find(userId, id);
  }

  async deleteDiscardedBefore(userId: string, cutoff: Date): Promise<number> {
    const { count } = await this.prisma.capture.deleteMany({
      where: { userId, status: 'DISCARDED', discardedAt: { lt: cutoff } },
    });

    return count;
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
  const { amount, currency, businessDate, rawPayload, discardedFrom, ...fields } = row;

  return {
    ...fields,
    businessDate: fromDatabaseDate(businessDate),
    amount: amount === null ? null : { value: amount.toFixed(2), currency },
    rawPayload: payloadOf(rawPayload),
    // La base solo admite estos dos (`captures_discarded_from_inbox`).
    discardedFrom:
      discardedFrom === 'DUPLICATE' ? 'DUPLICATE' : discardedFrom === null ? null : 'PENDING',
  };
}

/** El pedido crudo es un objeto de textos (lo exige la base); se copian solo esos. */
function payloadOf(value: Prisma.JsonValue): Record<string, string> | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return null;
  return Object.fromEntries(
    Object.entries(value).filter(
      (entry): entry is [string, string] => typeof entry[1] === 'string',
    ),
  );
}

/** Lo que cambia, en columnas. Solo lo que viene. */
function dataOf(changes: CaptureChanges): Prisma.CaptureUncheckedUpdateManyInput {
  const { amount, businessDate, ...fields } = changes;

  return {
    ...fields,
    ...(businessDate === undefined ? {} : { businessDate: toDatabaseDate(businessDate) }),
    ...(amount === undefined
      ? {}
      : { amount: amount?.value ?? null, currency: amount?.currency ?? null }),
    // El pedido crudo se borra al confirmar (decisión 14): la base lo exige con su `CHECK`.
    ...(fields.status === 'CONFIRMED' ? { rawPayload: Prisma.DbNull } : {}),
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
