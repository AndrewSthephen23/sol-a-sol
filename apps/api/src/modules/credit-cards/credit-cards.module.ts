import { Module } from '@nestjs/common';

import { PrismaModule } from '../../shared/prisma/prisma.module.js';
import { CatalogLookup, CatalogModule } from '../catalog/index.js';
import { IdentityModule } from '../identity/index.js';
import { TransactionsLookup, TransactionsModule } from '../transactions/index.js';
import { GetCreditCardStatuses } from './application/credit-card-status.js';
import {
  CreateInstallmentPlan,
  DeleteInstallmentPlan,
  ListInstallmentPlans,
} from './application/installment-plans.js';
import { InstallmentPlansController } from './http/installment-plans.controller.js';
import { PrismaInstallmentPlanRepository } from './infrastructure/prisma-installment-plan-repository.js';
import { INSTALLMENT_PLAN_REPOSITORY } from './ports/installment-plan-repository.js';
import {
  ConfigureCreditCard,
  ListCreditCards,
  UpdateCreditCard,
} from './application/credit-cards.js';
import { CreditCardsController } from './http/credit-cards.controller.js';
import { PrismaCreditCardRepository } from './infrastructure/prisma-credit-card-repository.js';
import { CREDIT_CARD_CATALOG_READER } from './ports/catalog-reader.js';
import { CREDIT_CARD_REPOSITORY } from './ports/credit-card-repository.js';
import { CREDIT_CARD_MOVEMENTS_READER } from './ports/movements-reader.js';

/**
 * Módulo credit-cards. Entra a main detrás de FEATURE_CREDIT_CARDS: sus rutas llevan
 * `@RequiresFeature('credit-cards')` y responden 404 mientras el flag esté apagado.
 *
 * Importa solo la API pública de otros módulos: de `identity`, el guard que resuelve quién pide;
 * de `catalog`, `CatalogLookup`, que cumple el puerto `CreditCardCatalogReader` (el tipo y lo que
 * identifica a cada método de pago); de `transactions`, `TransactionsLookup`, que cumple
 * `CreditCardMovementsReader` (lo que se compró y se pagó con cada tarjeta).
 */
@Module({
  imports: [PrismaModule, IdentityModule, CatalogModule, TransactionsModule],
  controllers: [CreditCardsController, InstallmentPlansController],
  providers: [
    ListCreditCards,
    ConfigureCreditCard,
    UpdateCreditCard,
    GetCreditCardStatuses,
    ListInstallmentPlans,
    CreateInstallmentPlan,
    DeleteInstallmentPlan,
    { provide: INSTALLMENT_PLAN_REPOSITORY, useClass: PrismaInstallmentPlanRepository },
    { provide: CREDIT_CARD_REPOSITORY, useClass: PrismaCreditCardRepository },
    { provide: CREDIT_CARD_CATALOG_READER, useExisting: CatalogLookup },
    { provide: CREDIT_CARD_MOVEMENTS_READER, useExisting: TransactionsLookup },
  ],
  exports: [],
})
export class CreditCardsModule {}
