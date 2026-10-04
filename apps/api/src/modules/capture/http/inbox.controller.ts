import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  type CaptureParams,
  captureParamsSchema,
  type ListCapturesQuery,
  listCapturesQuerySchema,
  type UpdateCaptureRequest,
  updateCaptureRequestSchema,
} from '@sol-a-sol/contracts';
import { LocalDate } from '@sol-a-sol/domain';

import { RequiresFeature } from '../../../shared/feature-flags/feature-flag.guard.js';
import { ZodValidationPipe } from '../../../shared/http/zod-validation.pipe.js';
import { AccessTokenGuard, CurrentUser } from '../../identity/index.js';
import {
  CorrectCapture,
  DiscardCapture,
  GetCapture,
  ListCaptures,
  RestoreCapture,
} from '../application/inbox.js';
import type { Capture } from '../ports/capture-repository.js';
import { type CaptureResponse, captureResponse } from './captures.controller.js';
import { decodeCaptureCursor, encodeCaptureCursor } from './cursor.js';

/**
 * Una captura en la bandeja: lo entendido, la descripción, el pedido crudo **completo** mientras
 * no se confirme (decisión 14) y, si se descartó, cuándo.
 */
export interface InboxCaptureResponse extends CaptureResponse {
  description: string | null;
  raw: Record<string, string> | null;
  discardedAt: string | null;
}

export interface InboxPageResponse {
  items: InboxCaptureResponse[];
  /** Para pedir la página siguiente, tal cual; `null` si no hay más. */
  nextCursor: string | null;
}

function inboxResponse(capture: Capture): InboxCaptureResponse {
  return {
    ...captureResponse(capture),
    description: capture.description,
    raw: capture.rawPayload,
    discardedAt: capture.discardedAt?.toISOString() ?? null,
  };
}

/**
 * La bandeja: revisar, corregir, descartar y deshacer. **Solo desde una sesión**: un token
 * personal recibe 403, porque el teléfono solo crea capturas.
 */
@Controller('captures')
@RequiresFeature('capture')
@UseGuards(AccessTokenGuard)
export class InboxController {
  constructor(
    private readonly listCaptures: ListCaptures,
    private readonly getCapture: GetCapture,
    private readonly correctCapture: CorrectCapture,
    private readonly discardCapture: DiscardCapture,
    private readonly restoreCapture: RestoreCapture,
  ) {}

  @Get()
  async list(
    @CurrentUser() userId: string,
    @Query(new ZodValidationPipe(listCapturesQuerySchema)) query: ListCapturesQuery,
  ): Promise<InboxPageResponse> {
    const page = await this.listCaptures.execute(userId, {
      status: query.status,
      after: query.cursor === undefined ? null : decodeCaptureCursor(query.cursor),
      limit: query.limit,
    });

    return {
      items: page.captures.map(inboxResponse),
      nextCursor: page.next === null ? null : encodeCaptureCursor(page.next),
    };
  }

  @Get(':id')
  async get(
    @CurrentUser() userId: string,
    @Param(new ZodValidationPipe(captureParamsSchema)) params: CaptureParams,
  ): Promise<InboxCaptureResponse> {
    return inboxResponse(await this.getCapture.execute(userId, params.id));
  }

  @Patch(':id')
  async update(
    @CurrentUser() userId: string,
    @Param(new ZodValidationPipe(captureParamsSchema)) params: CaptureParams,
    @Body(new ZodValidationPipe(updateCaptureRequestSchema)) body: UpdateCaptureRequest,
  ): Promise<InboxCaptureResponse> {
    const { date, ...rest } = body;

    return inboxResponse(
      await this.correctCapture.execute(userId, params.id, {
        ...rest,
        ...(date === undefined ? {} : { date: LocalDate.parse(date) }),
      }),
    );
  }

  @Post(':id/discard')
  @HttpCode(HttpStatus.OK)
  async discard(
    @CurrentUser() userId: string,
    @Param(new ZodValidationPipe(captureParamsSchema)) params: CaptureParams,
  ): Promise<InboxCaptureResponse> {
    return inboxResponse(await this.discardCapture.execute(userId, params.id));
  }

  @Post(':id/restore')
  @HttpCode(HttpStatus.OK)
  async restore(
    @CurrentUser() userId: string,
    @Param(new ZodValidationPipe(captureParamsSchema)) params: CaptureParams,
  ): Promise<InboxCaptureResponse> {
    return inboxResponse(await this.restoreCapture.execute(userId, params.id));
  }
}
