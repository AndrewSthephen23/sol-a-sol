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
  type CreateTransactionRequest,
  createTransactionRequestSchema,
  type UpdateTransactionRequest,
  updateTransactionRequestSchema,
} from '@sol-a-sol/contracts';
import { z } from 'zod';

import { RequiresFeature } from '../../../shared/feature-flags/feature-flag.guard.js';
import { ZodValidationPipe } from '../../../shared/http/zod-validation.pipe.js';
import { AccessTokenGuard, CurrentUser } from '../../identity/index.js';
import {
  CreateTransaction,
  DeleteTransaction,
  GetTransaction,
  RestoreTransaction,
  UpdateTransaction,
} from '../application/transactions.js';
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
    private readonly updateTransaction: UpdateTransaction,
    private readonly deleteTransaction: DeleteTransaction,
    private readonly restoreTransaction: RestoreTransaction,
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
    assertTransactionId(id);

    return toResponse(await this.getTransaction.execute({ userId, id }));
  }

  /** Corrige cualquier campo menos el origen. 404 si no existe, es ajena o está borrada. */
  @Patch(':id')
  async update(
    @CurrentUser() userId: string,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateTransactionRequestSchema)) body: UpdateTransactionRequest,
  ): Promise<TransactionResponse> {
    assertTransactionId(id);

    return toResponse(await this.updateTransaction.execute({ userId, id, changes: body }));
  }

  /** Borrado lógico: deja de aparecer y se puede restaurar. 404 si ya estaba borrada. */
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@CurrentUser() userId: string, @Param('id') id: string): Promise<void> {
    assertTransactionId(id);

    await this.deleteTransaction.execute({ userId, id });
  }

  /** Deshace el borrado, sin plazo. Con una que no está borrada, la devuelve tal cual. */
  @Post(':id/restore')
  @HttpCode(HttpStatus.OK)
  async restore(
    @CurrentUser() userId: string,
    @Param('id') id: string,
  ): Promise<TransactionResponse> {
    assertTransactionId(id);

    return toResponse(await this.restoreTransaction.execute({ userId, id }));
  }
}

/**
 * Un id que ni siquiera es un UUID tampoco existe: 404 y no 422, y la base no llega a ver un
 * valor que su tipo `uuid` rechazaría con un error interno.
 */
function assertTransactionId(id: string): void {
  if (!transactionIdSchema.safeParse(id).success) throw new TransactionNotFoundError();
}

function toResponse({ amount, date, ...fields }: Transaction): TransactionResponse {
  return {
    ...fields,
    date: date.toString(),
    amount: amount.toFixed(),
    currency: amount.currency,
  };
}
