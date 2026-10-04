import { Module } from '@nestjs/common';

import { PrismaModule } from '../../shared/prisma/prisma.module.js';
import { CatalogLookup, CatalogModule } from '../catalog/index.js';
import { IdentityModule } from '../identity/index.js';
import { TransactionsLookup, TransactionsModule } from '../transactions/index.js';
import { ReceiveCapture } from './application/receive-capture.js';
import { CapturesController } from './http/captures.controller.js';
import { PrismaCaptureRepository } from './infrastructure/prisma-capture-repository.js';
import { PrismaCategorizationRuleRepository } from './infrastructure/prisma-categorization-rule-repository.js';
import { CAPTURE_REPOSITORY } from './ports/capture-repository.js';
import { CAPTURE_CATALOG_READER } from './ports/catalog-reader.js';
import { CATEGORIZATION_RULE_REPOSITORY } from './ports/categorization-rule-repository.js';
import { CAPTURE_TRANSACTIONS_READER } from './ports/transactions-reader.js';

/**
 * Módulo capture. Entra a main detrás de FEATURE_CAPTURE: sus rutas llevan
 * `@RequiresFeature('capture')` y responden 404 mientras el flag esté apagado.
 *
 * Importa solo la API pública de otros módulos: de `identity`, el guard y el decorador de las
 * rutas del teléfono; de `catalog`, `CatalogLookup`, que cumple `CaptureCatalogReader` (métodos
 * de pago y categorías); de `transactions`, `TransactionsLookup`, que cumple
 * `CaptureTransactionsReader` (las transacciones de un día, para los duplicados).
 */
@Module({
  imports: [PrismaModule, IdentityModule, CatalogModule, TransactionsModule],
  controllers: [CapturesController],
  providers: [
    ReceiveCapture,
    { provide: CAPTURE_REPOSITORY, useClass: PrismaCaptureRepository },
    { provide: CATEGORIZATION_RULE_REPOSITORY, useClass: PrismaCategorizationRuleRepository },
    { provide: CAPTURE_CATALOG_READER, useExisting: CatalogLookup },
    { provide: CAPTURE_TRANSACTIONS_READER, useExisting: TransactionsLookup },
  ],
  exports: [],
})
export class CaptureModule {}
