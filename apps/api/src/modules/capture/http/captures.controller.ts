import { Body, Controller, HttpStatus, Post, Res, UseGuards } from '@nestjs/common';
import {
  type CreateCaptureRequest,
  createCaptureRequestSchema,
  idempotencyKeySchema,
} from '@sol-a-sol/contracts';

import { RequiresFeature } from '../../../shared/feature-flags/feature-flag.guard.js';
import { ZodValidationPipe } from '../../../shared/http/zod-validation.pipe.js';
import { CaptureRateLimit } from '../../../shared/throttling/rate-limits.js';
import {
  AccessTokenGuard,
  CurrentUser,
  RequiresPersonalAccessToken,
} from '../../identity/index.js';
import { ReceiveCapture } from '../application/receive-capture.js';
import { IdempotencyKey } from './idempotency-key.decorator.js';
import type { Capture } from '../ports/capture-repository.js';

/**
 * Lo que vuelve al teléfono: lo que se entendió, sin el texto crudo. `parsed` dice si se entendió
 * al menos el monto; `warnings`, qué hay que mirar en la bandeja.
 */
export interface CaptureResponse {
  id: string;
  source: string;
  status: string;
  parsed: boolean;
  type: string;
  amount: string | null;
  currency: string | null;
  merchant: string | null;
  cardLast4: string | null;
  date: string;
  occurredAt: string;
  categoryId: string | null;
  paymentMethodId: string | null;
  warnings: string[];
}

export function captureResponse(capture: Capture): CaptureResponse {
  return {
    id: capture.id,
    source: capture.source,
    status: capture.status,
    parsed: capture.amount !== null,
    type: capture.type,
    amount: capture.amount?.value ?? null,
    currency: capture.amount?.currency ?? null,
    merchant: capture.merchant,
    cardLast4: capture.cardLast4,
    date: capture.businessDate.toString(),
    occurredAt: capture.occurredAt.toISOString(),
    categoryId: capture.categoryId,
    paymentMethodId: capture.paymentMethodId,
    warnings: capture.warnings,
  };
}

/** Solo lo que hace falta para fijar el código de la respuesta. */
interface StatusResponse {
  status(code: number): unknown;
}

/**
 * La puerta del teléfono (plan, 8.1). **Solo con token personal** y el scope `captures:write`:
 * una sesión recibe 403. Tope propio de 30 por minuto (decisión 15).
 */
@Controller('captures')
@RequiresFeature('capture')
@UseGuards(AccessTokenGuard)
export class CapturesController {
  constructor(private readonly receiveCapture: ReceiveCapture) {}

  /** `201` con la captura nueva; `200` con la que ya existía si la clave se repite. */
  @Post()
  @RequiresPersonalAccessToken('captures:write')
  @CaptureRateLimit()
  async create(
    @CurrentUser() userId: string,
    @IdempotencyKey(new ZodValidationPipe(idempotencyKeySchema))
    idempotencyKey: string | undefined,
    @Body(new ZodValidationPipe(createCaptureRequestSchema)) body: CreateCaptureRequest,
    @Res({ passthrough: true }) response: StatusResponse,
  ): Promise<CaptureResponse> {
    const { capture, created } = await this.receiveCapture.execute(userId, body, idempotencyKey);
    response.status(created ? HttpStatus.CREATED : HttpStatus.OK);

    return captureResponse(capture);
  }
}
