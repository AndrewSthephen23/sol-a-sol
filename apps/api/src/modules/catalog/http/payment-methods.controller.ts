import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import {
  type CreatePaymentMethodRequest,
  createPaymentMethodRequestSchema,
  type ListPaymentMethodsQuery,
  listPaymentMethodsQuerySchema,
  type UpdatePaymentMethodRequest,
  updatePaymentMethodRequestSchema,
} from '@sol-a-sol/contracts';
import { z } from 'zod';

import { RequiresFeature } from '../../../shared/feature-flags/feature-flag.guard.js';
import { ZodValidationPipe } from '../../../shared/http/zod-validation.pipe.js';
import { AccessTokenGuard, CurrentUser } from '../../identity/index.js';
import {
  CreatePaymentMethod,
  ListPaymentMethods,
  UpdatePaymentMethod,
} from '../application/payment-methods.js';
import { PaymentMethodNotFoundError } from '../domain/errors.js';
import type { PaymentMethod } from '../ports/payment-method-repository.js';

const paymentMethodIdSchema = z.uuid();

/**
 * Métodos de pago: cuentas, billeteras, tarjetas y efectivo.
 *
 * Sin `DELETE`: un método con transacciones no se borra, se archiva (`archived: true`). Solo se
 * gestionan desde una sesión; un token personal recibe 403.
 */
@Controller('payment-methods')
@RequiresFeature('catalog')
@UseGuards(AccessTokenGuard)
export class PaymentMethodsController {
  constructor(
    private readonly createMethod: CreatePaymentMethod,
    private readonly listMethods: ListPaymentMethods,
    private readonly updateMethod: UpdatePaymentMethod,
  ) {}

  @Get()
  async list(
    @CurrentUser() userId: string,
    @Query(new ZodValidationPipe(listPaymentMethodsQuerySchema)) query: ListPaymentMethodsQuery,
  ): Promise<PaymentMethod[]> {
    return this.listMethods.execute({ userId, includeArchived: query.includeArchived });
  }

  @Post()
  async create(
    @CurrentUser() userId: string,
    @Body(new ZodValidationPipe(createPaymentMethodRequestSchema)) body: CreatePaymentMethodRequest,
  ): Promise<PaymentMethod> {
    return this.createMethod.execute({ userId, ...body });
  }

  /** 404 si no existe **o es de otra cuenta**: desde fuera no se distinguen. */
  @Patch(':id')
  async update(
    @CurrentUser() userId: string,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updatePaymentMethodRequestSchema)) body: UpdatePaymentMethodRequest,
  ): Promise<PaymentMethod> {
    // Un id que ni siquiera es un UUID tampoco existe: 404 y no 422, y la base no llega a ver
    // un valor que su tipo `uuid` rechazaría con un error interno.
    if (!paymentMethodIdSchema.safeParse(id).success) throw new PaymentMethodNotFoundError();

    return this.updateMethod.execute({ userId, id, changes: body });
  }
}
