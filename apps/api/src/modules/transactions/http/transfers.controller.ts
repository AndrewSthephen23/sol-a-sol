import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  type CreateTransferRequest,
  createTransferRequestSchema,
  type UpdateTransferRequest,
  updateTransferRequestSchema,
} from '@sol-a-sol/contracts';
import { z } from 'zod';

import { RequiresFeature } from '../../../shared/feature-flags/feature-flag.guard.js';
import { ZodValidationPipe } from '../../../shared/http/zod-validation.pipe.js';
import { AccessTokenGuard, CurrentUser } from '../../identity/index.js';
import {
  CreateTransfer,
  DeleteTransfer,
  GetTransfer,
  RestoreTransfer,
  UpdateTransfer,
} from '../application/transfers.js';
import { TransferNotFoundError } from '../domain/errors.js';
import type { Transfer } from '../ports/transfer-repository.js';

const transferIdSchema = z.uuid();

/** Lo que viaja: los montos como **string decimal**, cada uno con su moneda. */
export interface TransferResponse {
  id: string;
  date: string;
  fromPaymentMethodId: string;
  toPaymentMethodId: string;
  amount: string;
  currency: string;
  receivedAmount: string;
  receivedCurrency: string;
  description: string;
  source: Transfer['source'];
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Transferencias entre cuentas propias: plata que cambia de lugar sin ser ingreso ni gasto.
 * Parte del módulo `transactions`, detrás del mismo flag. Solo desde una sesión.
 */
@Controller('transfers')
@RequiresFeature('transactions')
@UseGuards(AccessTokenGuard)
export class TransfersController {
  constructor(
    private readonly createTransfer: CreateTransfer,
    private readonly getTransfer: GetTransfer,
    private readonly updateTransfer: UpdateTransfer,
    private readonly deleteTransfer: DeleteTransfer,
    private readonly restoreTransfer: RestoreTransfer,
  ) {}

  /** Lo que llega desde la web es `MANUAL`. */
  @Post()
  async create(
    @CurrentUser() userId: string,
    @Body(new ZodValidationPipe(createTransferRequestSchema)) body: CreateTransferRequest,
  ): Promise<TransferResponse> {
    return toResponse(await this.createTransfer.execute({ userId, ...body, source: 'MANUAL' }));
  }

  /** 404 si no existe, **es de otra cuenta o está borrada**. */
  @Get(':id')
  async find(@CurrentUser() userId: string, @Param('id') id: string): Promise<TransferResponse> {
    assertTransferId(id);

    return toResponse(await this.getTransfer.execute({ userId, id }));
  }

  /** Corrige lo que se mande, menos el origen. 404 si no existe, es ajena o está borrada. */
  @Patch(':id')
  async update(
    @CurrentUser() userId: string,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateTransferRequestSchema)) body: UpdateTransferRequest,
  ): Promise<TransferResponse> {
    assertTransferId(id);

    return toResponse(await this.updateTransfer.execute({ userId, id, changes: body }));
  }

  /** Borrado lógico. 404 si ya estaba borrada. */
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@CurrentUser() userId: string, @Param('id') id: string): Promise<void> {
    assertTransferId(id);

    await this.deleteTransfer.execute({ userId, id });
  }

  /** Deshace el borrado, sin plazo. Con una que no está borrada, la devuelve tal cual. */
  @Post(':id/restore')
  @HttpCode(HttpStatus.OK)
  async restore(@CurrentUser() userId: string, @Param('id') id: string): Promise<TransferResponse> {
    assertTransferId(id);

    return toResponse(await this.restoreTransfer.execute({ userId, id }));
  }
}

/** Un id que ni siquiera es un UUID tampoco existe: 404 y no 422. */
function assertTransferId(id: string): void {
  if (!transferIdSchema.safeParse(id).success) throw new TransferNotFoundError();
}

function toResponse({ amount, receivedAmount, date, ...fields }: Transfer): TransferResponse {
  return {
    ...fields,
    date: date.toString(),
    amount: amount.toFixed(),
    currency: amount.currency,
    receivedAmount: receivedAmount.toFixed(),
    receivedCurrency: receivedAmount.currency,
  };
}
