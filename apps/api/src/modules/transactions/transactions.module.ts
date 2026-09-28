import { Module } from '@nestjs/common';

import { PrismaModule } from '../../shared/prisma/prisma.module.js';
import { TimeModule } from '../../shared/time/time.module.js';
import { CatalogLookup, CatalogModule } from '../catalog/index.js';
import { IdentityModule } from '../identity/index.js';
import {
  CreateTransaction,
  DeleteTransaction,
  GetTransaction,
  ListTransactions,
  RestoreTransaction,
  UpdateTransaction,
} from './application/transactions.js';
import { PreviewImport } from './application/import-preview.js';
import { ReassignCategory } from './application/reassign-category.js';
import { DeleteTag, ListTags, RenameTag } from './application/tags.js';
import {
  CreateTransfer,
  DeleteTransfer,
  GetTransfer,
  RestoreTransfer,
  UpdateTransfer,
} from './application/transfers.js';
import { TagsController } from './http/tags.controller.js';
import { TransactionsController } from './http/transactions.controller.js';
import { TransfersController } from './http/transfers.controller.js';
import { CategoryMergedListener } from './infrastructure/category-merged.listener.js';
import { PrismaTagRepository } from './infrastructure/prisma-tag-repository.js';
import { PrismaTransactionRepository } from './infrastructure/prisma-transaction-repository.js';
import { PrismaTransferRepository } from './infrastructure/prisma-transfer-repository.js';
import { CATALOG_READER } from './ports/catalog-reader.js';
import { TAG_REPOSITORY } from './ports/tag-repository.js';
import { TRANSACTION_REPOSITORY } from './ports/transaction-repository.js';
import { TRANSFER_REPOSITORY } from './ports/transfer-repository.js';

/**
 * Módulo transactions. Entra a main detrás de FEATURE_TRANSACTIONS: sus rutas llevan
 * `@RequiresFeature('transactions')` y responden 404 mientras el flag esté apagado.
 *
 * Importa solo la API pública de otros módulos: de `identity`, el guard que resuelve quién pide;
 * de `catalog`, `CatalogLookup`, que cumple el puerto `CatalogReader`.
 */
@Module({
  imports: [PrismaModule, TimeModule, IdentityModule, CatalogModule],
  controllers: [TransactionsController, TransfersController, TagsController],
  providers: [
    CreateTransaction,
    GetTransaction,
    ListTransactions,
    UpdateTransaction,
    DeleteTransaction,
    RestoreTransaction,
    { provide: TRANSACTION_REPOSITORY, useClass: PrismaTransactionRepository },
    CreateTransfer,
    GetTransfer,
    UpdateTransfer,
    DeleteTransfer,
    RestoreTransfer,
    { provide: TRANSFER_REPOSITORY, useClass: PrismaTransferRepository },
    ListTags,
    RenameTag,
    DeleteTag,
    ReassignCategory,
    PreviewImport,
    CategoryMergedListener,
    { provide: TAG_REPOSITORY, useClass: PrismaTagRepository },
    { provide: CATALOG_READER, useExisting: CatalogLookup },
  ],
  exports: [],
})
export class TransactionsModule {}
