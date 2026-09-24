import { Module } from '@nestjs/common';

import { PrismaModule } from '../../shared/prisma/prisma.module.js';
import { TimeModule } from '../../shared/time/time.module.js';
import { IdentityModule } from '../identity/index.js';
import {
  CreatePaymentMethod,
  ListPaymentMethods,
  UpdatePaymentMethod,
} from './application/payment-methods.js';
import { PaymentMethodsController } from './http/payment-methods.controller.js';
import { PrismaPaymentMethodRepository } from './infrastructure/prisma-payment-method-repository.js';
import { PAYMENT_METHOD_REPOSITORY } from './ports/payment-method-repository.js';

/**
 * Módulo catalog. Entra a main detrás de FEATURE_CATALOG: sus rutas llevan
 * `@RequiresFeature('catalog')` y responden 404 mientras el flag esté apagado.
 *
 * Importa `IdentityModule` solo por su API pública: el guard que resuelve quién pide.
 */
@Module({
  imports: [PrismaModule, TimeModule, IdentityModule],
  controllers: [PaymentMethodsController],
  providers: [
    CreatePaymentMethod,
    ListPaymentMethods,
    UpdatePaymentMethod,
    { provide: PAYMENT_METHOD_REPOSITORY, useClass: PrismaPaymentMethodRepository },
  ],
  exports: [],
})
export class CatalogModule {}
