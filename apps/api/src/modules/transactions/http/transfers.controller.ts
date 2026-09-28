import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { type CreateTransferRequest, createTransferRequestSchema } from '@sol-a-sol/contracts';
import { z } from 'zod';

import { RequiresFeature } from '../../../shared/feature-flags/feature-flag.guard.js';
import { ZodValidationPipe } from '../../../shared/http/zod-validation.pipe.js';
import { AccessTokenGuard, CurrentUser } from '../../identity/index.js';
import { CreateTransfer, GetTransfer } from '../application/transfers.js';
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
    if (!transferIdSchema.safeParse(id).success) throw new TransferNotFoundError();

    return toResponse(await this.getTransfer.execute({ userId, id }));
  }
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
