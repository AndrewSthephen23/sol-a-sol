import { createHash } from 'node:crypto';

import { Inject, Injectable, Logger } from '@nestjs/common';
import { maskCardNumbers, parseNotification } from '@sol-a-sol/capture-parsers';
import {
  type CaptureAmount,
  captureBusinessDate,
  type CategorizationRuleCandidate,
  type Clock,
  DUPLICATE_WINDOW_MS,
  findDuplicate,
  matchPaymentMethod,
  readCaptureRequest,
  resolveCaptureCurrency,
  suggestCategory,
} from '@sol-a-sol/domain';

import { CLOCK } from '../../../shared/time/system-clock.js';
import {
  type Capture,
  CAPTURE_REPOSITORY,
  type CaptureRepository,
  type CaptureSource,
  IdempotencyKeyTakenError,
  type NewCapture,
} from '../ports/capture-repository.js';
import { CAPTURE_CATALOG_READER, type CaptureCatalogReader } from '../ports/catalog-reader.js';
import {
  CATEGORIZATION_RULE_REPOSITORY,
  type CategorizationRuleRepository,
} from '../ports/categorization-rule-repository.js';
import {
  CAPTURE_TRANSACTIONS_READER,
  type CaptureTransactionsReader,
} from '../ports/transactions-reader.js';

/** Lo que manda el teléfono, ya validado en su forma (`createCaptureRequestSchema`). */
export interface CaptureRequestBody {
  source: CaptureSource;
  occurredAt: string;
  amountText?: string | null;
  merchant?: string | null;
  card?: string | null;
  rawText?: string | null;
}

export interface ReceivedCapture {
  capture: Capture;
  /** `false` si la clave de idempotencia ya existía: se devuelve la captura que se guardó antes. */
  created: boolean;
}

/** Aviso de esta capa: no se pudo buscar método, reglas o duplicados, pero la captura se guardó. */
const PROCESSING_FAILED = 'PROCESSING_FAILED';
const CARD_NUMBER_MASKED = 'CARD_NUMBER_MASKED';

type CaptureDraft = Omit<NewCapture, 'rawPayload' | 'idempotencyKey'>;

/**
 * Recibe lo que manda el teléfono (plan, 8.1 y 8.2). La regla de oro: **una captura bien formada
 * se guarda siempre**, se entienda o no, y nunca dos veces por un reintento.
 *
 * 1. Tapa los números de tarjeta de todos los campos: el pedido crudo se guarda ya tapado.
 * 2. Si la clave de idempotencia ya existe, devuelve esa captura sin volver a procesar nada. Sin
 *    `Idempotency-Key`, la clave sale de **todo el pedido** (decidido el 2026-10-04): dos
 *    notificaciones distintas del mismo instante no chocan.
 * 3. Entiende el pedido con el dominio (monto, fecha, tipo) y, si se puede, reconoce el método,
 *    sugiere la categoría y busca duplicados. Si eso falla, guarda igual con `PROCESSING_FAILED`.
 *
 * Nunca registra en los logs el texto de la notificación.
 */
@Injectable()
export class ReceiveCapture {
  private readonly logger = new Logger(ReceiveCapture.name);

  constructor(
    @Inject(CAPTURE_REPOSITORY) private readonly captures: CaptureRepository,
    @Inject(CATEGORIZATION_RULE_REPOSITORY) private readonly rules: CategorizationRuleRepository,
    @Inject(CAPTURE_CATALOG_READER) private readonly catalog: CaptureCatalogReader,
    @Inject(CAPTURE_TRANSACTIONS_READER) private readonly transactions: CaptureTransactionsReader,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(
    userId: string,
    request: CaptureRequestBody,
    idempotencyKey?: string,
  ): Promise<ReceivedCapture> {
    const { payload, masked } = maskedPayload(request);
    const key = idempotencyKey ?? automaticKey(payload);

    const existing = await this.captures.findByIdempotencyKey(userId, key);
    if (existing !== null) return { capture: existing, created: false };

    const draft = await this.interpret(userId, payload, masked);
    try {
      const capture = await this.captures.create(userId, {
        ...draft,
        rawPayload: payload,
        idempotencyKey: key,
      });
      return { capture, created: true };
    } catch (error) {
      // Otro reintento con la misma clave guardó entre la búsqueda y aquí: es la misma captura.
      if (!(error instanceof IdempotencyKeyTakenError)) throw error;
      const raced = await this.captures.findByIdempotencyKey(userId, key);
      if (raced === null) throw error;
      return { capture: raced, created: false };
    }
  }

  private async interpret(
    userId: string,
    payload: Record<string, string>,
    masked: boolean,
  ): Promise<CaptureDraft> {
    const rawText = payload.rawText ?? null;
    const notification = rawText === null ? null : parseNotification(rawText);
    const reading = readCaptureRequest({
      amountText: payload.amountText ?? null,
      merchant: payload.merchant ?? null,
      card: payload.card ?? null,
      notification,
    });
    const occurredAt = new Date(payload.occurredAt ?? '');
    const { date, warnings: dateWarnings } = captureBusinessDate(occurredAt, this.clock.now());
    const warnings = [...reading.warnings, ...dateWarnings];
    if (masked && !warnings.includes(CARD_NUMBER_MASKED)) warnings.push(CARD_NUMBER_MASKED);

    const draft: CaptureDraft = {
      source: payload.source as CaptureSource,
      status: 'PENDING',
      type: reading.type,
      occurredAt,
      businessDate: date,
      amount: reading.amount,
      merchant: reading.merchant,
      cardLast4: reading.cardLast4,
      description: null,
      categoryId: null,
      paymentMethodId: null,
      warnings,
    };

    try {
      return await this.match(userId, draft, reading.cardText, rawText);
    } catch (error) {
      this.logger.error(
        `Could not match capture of user ${userId}: ${error instanceof Error ? error.message : 'unknown error'}`,
      );
      return { ...draft, warnings: [...warnings, PROCESSING_FAILED] };
    }
  }

  /** Método de pago y moneda, categoría sugerida y duplicados (decisiones 3, 4, 6 y 12). */
  private async match(
    userId: string,
    draft: CaptureDraft,
    cardText: string | null,
    rawText: string | null,
  ): Promise<CaptureDraft> {
    const [methods, categories, rules] = await Promise.all([
      this.catalog.allPaymentMethods(userId),
      this.catalog.allCategories(userId),
      this.rules.list(userId),
    ]);

    const paymentMethodId = matchPaymentMethod(methods, draft.cardLast4, cardText);
    const method = methods.find(({ id }) => id === paymentMethodId);
    const { currency, warnings } = resolveCaptureCurrency(draft.amount, method?.currency ?? null);
    const amount: CaptureAmount | null =
      draft.amount === null ? null : { value: draft.amount.value, currency };

    const categoryById = new Map(categories.map((category) => [category.id, category]));
    const candidates = rules.flatMap((rule): CategorizationRuleCandidate[] => {
      const category = categoryById.get(rule.categoryId);
      if (category === undefined) return [];
      return [
        {
          categoryId: rule.categoryId,
          categoryType: category.type,
          categoryArchived: category.archived,
          patternKey: rule.patternKey,
          priority: rule.priority,
        },
      ];
    });
    const categoryId = suggestCategory(candidates, draft.type, draft.merchant, rawText);

    const duplicate = await this.isDuplicate(userId, { ...draft, amount });

    return {
      ...draft,
      amount,
      paymentMethodId,
      categoryId,
      status: duplicate ? 'DUPLICATE' : 'PENDING',
      warnings: [...draft.warnings, ...warnings],
    };
  }

  private async isDuplicate(userId: string, draft: CaptureDraft): Promise<boolean> {
    // Sin monto con moneda o sin comercio no hay con qué comparar: no se consulta nada.
    if (draft.amount?.currency == null || draft.merchant === null) return false;
    const at = draft.occurredAt.getTime();
    const [captures, transactions] = await Promise.all([
      this.captures.listOccurredBetween(
        userId,
        new Date(at - DUPLICATE_WINDOW_MS),
        new Date(at + DUPLICATE_WINDOW_MS),
      ),
      this.transactions.liveTransactionsOn(userId, draft.businessDate),
    ]);

    const probe = {
      amount: draft.amount,
      merchant: draft.merchant,
      occurredAt: draft.occurredAt,
      date: draft.businessDate,
    };
    return findDuplicate(probe, captures, transactions) !== null;
  }
}

/** El pedido con sus números de tarjeta tapados, sin los campos vacíos. */
function maskedPayload(request: CaptureRequestBody): {
  payload: Record<string, string>;
  masked: boolean;
} {
  const payload: Record<string, string> = {};
  let masked = false;

  for (const [field, value] of Object.entries(request)) {
    if (typeof value !== 'string' || value.trim() === '') continue;
    const result = maskCardNumbers(value);
    payload[field] = result.text;
    masked ||= result.masked;
  }
  return { payload, masked };
}

/**
 * La clave de un pedido sin `Idempotency-Key`: un resumen de todo lo que mandó, con el instante
 * en UTC para que la misma hora escrita en otra zona dé lo mismo.
 */
function automaticKey(payload: Record<string, string>): string {
  const fields = [
    payload.source,
    new Date(payload.occurredAt ?? '').toISOString(),
    payload.amountText ?? null,
    payload.merchant ?? null,
    payload.card ?? null,
    payload.rawText ?? null,
  ];
  return `auto:${createHash('sha256').update(JSON.stringify(fields)).digest('hex')}`;
}
