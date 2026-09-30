import { Module } from '@nestjs/common';

import { PrismaModule } from '../../shared/prisma/prisma.module.js';
import { CatalogLookup, CatalogModule } from '../catalog/index.js';
import { IdentityModule } from '../identity/index.js';
import {
  ConfigureCreditCard,
  ListCreditCards,
  UpdateCreditCard,
} from './application/credit-cards.js';
import { CreditCardsController } from './http/credit-cards.controller.js';
import { PrismaCreditCardRepository } from './infrastructure/prisma-credit-card-repository.js';
import { CREDIT_CARD_CATALOG_READER } from './ports/catalog-reader.js';
import { CREDIT_CARD_REPOSITORY } from './ports/credit-card-repository.js';

/**
 * Módulo credit-cards. Entra a main detrás de FEATURE_CREDIT_CARDS: sus rutas llevan
 * `@RequiresFeature('credit-cards')` y responden 404 mientras el flag esté apagado.
 *
 * Importa solo la API pública de otros módulos: de `identity`, el guard que resuelve quién pide;
 * de `catalog`, `CatalogLookup`, que cumple el puerto `CreditCardCatalogReader` (el tipo y lo que
 * identifica a cada método de pago).
 */
@Module({
  imports: [PrismaModule, IdentityModule, CatalogModule],
  controllers: [CreditCardsController],
  providers: [
    ListCreditCards,
    ConfigureCreditCard,
    UpdateCreditCard,
    { provide: CREDIT_CARD_REPOSITORY, useClass: PrismaCreditCardRepository },
    { provide: CREDIT_CARD_CATALOG_READER, useExisting: CatalogLookup },
  ],
  exports: [],
})
export class CreditCardsModule {}
