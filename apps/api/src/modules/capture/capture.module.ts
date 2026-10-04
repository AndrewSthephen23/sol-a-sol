import { Module } from '@nestjs/common';

import { PrismaModule } from '../../shared/prisma/prisma.module.js';
import { CatalogLookup, CatalogModule } from '../catalog/index.js';
import { IdentityModule, ListAccountIds } from '../identity/index.js';
import { FeatureFlagsService } from '../../shared/feature-flags/feature-flags.js';
import {
  TransactionsLookup,
  TransactionsModule,
  TransactionsRecorder,
} from '../transactions/index.js';
import { ConfirmCapture, ConfirmCaptures } from './application/confirm.js';
import {
  CreateCategorizationRule,
  DeleteCategorizationRule,
  FollowCategoryMerge,
  ListCategorizationRules,
  UpdateCategorizationRule,
} from './application/rules.js';
import { CategorizationRulesController } from './http/categorization-rules.controller.js';
import { CaptureCategoryMergedListener } from './infrastructure/category-merged.listener.js';
import {
  CorrectCapture,
  DiscardCapture,
  GetCapture,
  ListCaptures,
  PurgeDiscardedCaptures,
  RestoreCapture,
} from './application/inbox.js';
import { ReceiveCapture } from './application/receive-capture.js';
import { CapturesController } from './http/captures.controller.js';
import { InboxController } from './http/inbox.controller.js';
import { DiscardedCapturesPurgeJob } from './infrastructure/discarded-captures-purge.job.js';
import { PrismaCaptureRepository } from './infrastructure/prisma-capture-repository.js';
import { PrismaCategorizationRuleRepository } from './infrastructure/prisma-categorization-rule-repository.js';
import { CAPTURE_ACCOUNTS_READER, CAPTURE_FEATURE_FLAGS } from './ports/accounts-reader.js';
import { CAPTURE_REPOSITORY } from './ports/capture-repository.js';
import { CAPTURE_CATALOG_READER } from './ports/catalog-reader.js';
import { CATEGORIZATION_RULE_REPOSITORY } from './ports/categorization-rule-repository.js';
import { CAPTURE_TRANSACTIONS_READER } from './ports/transactions-reader.js';
import { CAPTURE_TRANSACTIONS_WRITER } from './ports/transactions-writer.js';

/**
 * Módulo capture. Entra a main detrás de FEATURE_CAPTURE: sus rutas llevan
 * `@RequiresFeature('capture')` y responden 404 mientras el flag esté apagado.
 *
 * Importa solo la API pública de otros módulos: de `identity`, el guard y el decorador de las
 * rutas del teléfono; de `catalog`, `CatalogLookup`, que cumple `CaptureCatalogReader` (métodos
 * de pago y categorías); de `transactions`, `TransactionsLookup`, que cumple
 * `CaptureTransactionsReader` (las transacciones de un día, para los duplicados), y
 * `TransactionsRecorder`, que cumple `CaptureTransactionsWriter` (la transacción de una captura
 * confirmada: la única escritura de `capture` en otro módulo). Las cuentas, para
 * el borrado diario de las descartadas, salen de `ListAccountIds`; qué está encendido, de
 * `FeatureFlagsService`, también detrás de un puerto.
 */
@Module({
  imports: [PrismaModule, IdentityModule, CatalogModule, TransactionsModule],
  controllers: [CapturesController, InboxController, CategorizationRulesController],
  providers: [
    ReceiveCapture,
    ListCaptures,
    GetCapture,
    CorrectCapture,
    DiscardCapture,
    RestoreCapture,
    ConfirmCapture,
    ConfirmCaptures,
    ListCategorizationRules,
    CreateCategorizationRule,
    UpdateCategorizationRule,
    DeleteCategorizationRule,
    FollowCategoryMerge,
    CaptureCategoryMergedListener,
    PurgeDiscardedCaptures,
    DiscardedCapturesPurgeJob,
    { provide: CAPTURE_REPOSITORY, useClass: PrismaCaptureRepository },
    { provide: CATEGORIZATION_RULE_REPOSITORY, useClass: PrismaCategorizationRuleRepository },
    { provide: CAPTURE_CATALOG_READER, useExisting: CatalogLookup },
    { provide: CAPTURE_TRANSACTIONS_READER, useExisting: TransactionsLookup },
    { provide: CAPTURE_TRANSACTIONS_WRITER, useExisting: TransactionsRecorder },
    { provide: CAPTURE_ACCOUNTS_READER, useExisting: ListAccountIds },
    { provide: CAPTURE_FEATURE_FLAGS, useExisting: FeatureFlagsService },
  ],
  exports: [],
})
export class CaptureModule {}
