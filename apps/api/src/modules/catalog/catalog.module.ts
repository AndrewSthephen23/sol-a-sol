import { Module } from '@nestjs/common';

import { PrismaModule } from '../../shared/prisma/prisma.module.js';
import { TimeModule } from '../../shared/time/time.module.js';
import { IdentityModule } from '../identity/index.js';
import { CreateCategory, ListCategories, UpdateCategory } from './application/categories.js';
import {
  CreatePaymentMethod,
  ListPaymentMethods,
  UpdatePaymentMethod,
} from './application/payment-methods.js';
import { CategoriesController } from './http/categories.controller.js';
import { PaymentMethodsController } from './http/payment-methods.controller.js';
import { PrismaCategoryRepository } from './infrastructure/prisma-category-repository.js';
import { PrismaPaymentMethodRepository } from './infrastructure/prisma-payment-method-repository.js';
import { CATEGORY_REPOSITORY } from './ports/category-repository.js';
import { PAYMENT_METHOD_REPOSITORY } from './ports/payment-method-repository.js';

/**
 * Módulo catalog. Entra a main detrás de FEATURE_CATALOG: sus rutas llevan
 * `@RequiresFeature('catalog')` y responden 404 mientras el flag esté apagado.
 *
 * Importa `IdentityModule` solo por su API pública: el guard que resuelve quién pide.
 */
@Module({
  imports: [PrismaModule, TimeModule, IdentityModule],
  controllers: [CategoriesController, PaymentMethodsController],
  providers: [
    CreateCategory,
    ListCategories,
    UpdateCategory,
    { provide: CATEGORY_REPOSITORY, useClass: PrismaCategoryRepository },
    CreatePaymentMethod,
    ListPaymentMethods,
    UpdatePaymentMethod,
    { provide: PAYMENT_METHOD_REPOSITORY, useClass: PrismaPaymentMethodRepository },
  ],
  exports: [],
})
export class CatalogModule {}
