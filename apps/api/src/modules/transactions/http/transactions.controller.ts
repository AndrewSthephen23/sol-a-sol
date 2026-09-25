import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import {
  type CreateTransactionRequest,
  createTransactionRequestSchema,
} from '@sol-a-sol/contracts';
import { z } from 'zod';

import { RequiresFeature } from '../../../shared/feature-flags/feature-flag.guard.js';
import { ZodValidationPipe } from '../../../shared/http/zod-validation.pipe.js';
import { AccessTokenGuard, CurrentUser } from '../../identity/index.js';
import { CreateTransaction, GetTransaction } from '../application/transactions.js';
import { TransactionNotFoundError } from '../domain/errors.js';
import type { Transaction } from '../ports/transaction-repository.js';

const transactionIdSchema = z.uuid();

/** Lo que viaja: el monto como **string decimal** y la fecha como `YYYY-MM-DD`. */
export interface TransactionResponse {
  id: string;
  date: string;
  type: Transaction['type'];
  categoryId: string;
  amount: string;
  currency: string;
  description: string;
  paymentMethodId: string | null;
  merchant: string | null;
  source: Transaction['source'];
  captureId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Transacciones: ingresos, gastos, ahorro, inversión y pagos de deuda.
 *
 * Solo desde una sesión: un token personal recibe 403. El celular registra por `/captures` (H7),
 * que pasa por la bandeja de revisión antes de volverse transacción.
 */
@Controller('transactions')
@RequiresFeature('transactions')
@UseGuards(AccessTokenGuard)
export class TransactionsController {
  constructor(
    private readonly createTransaction: CreateTransaction,
    private readonly getTransaction: GetTransaction,
  ) {}

  /** Lo que llega desde la web es `MANUAL`: quien llama no elige de dónde vino. */
  @Post()
  async create(
    @CurrentUser() userId: string,
    @Body(new ZodValidationPipe(createTransactionRequestSchema)) body: CreateTransactionRequest,
  ): Promise<TransactionResponse> {
    const created = await this.createTransaction.execute({ userId, ...body, source: 'MANUAL' });

    return toResponse(created);
  }

  /** 404 si no existe, **es de otra cuenta o está borrada**: desde fuera no se distinguen. */
  @Get(':id')
  async find(@CurrentUser() userId: string, @Param('id') id: string): Promise<TransactionResponse> {
    // Un id que ni siquiera es un UUID tampoco existe: 404 y no 422, y la base no llega a ver
    // un valor que su tipo `uuid` rechazaría con un error interno.
    if (!transactionIdSchema.safeParse(id).success) throw new TransactionNotFoundError();

    return toResponse(await this.getTransaction.execute({ userId, id }));
  }
}

function toResponse({ amount, date, ...fields }: Transaction): TransactionResponse {
  return {
    ...fields,
    date: date.toString(),
    amount: amount.toFixed(),
    currency: amount.currency,
  };
}
