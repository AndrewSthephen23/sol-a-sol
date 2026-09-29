import { Module } from '@nestjs/common';

import { PrismaModule } from '../../shared/prisma/prisma.module.js';
import { CatalogLookup, CatalogModule } from '../catalog/index.js';
import { TransactionsLookup, TransactionsModule } from '../transactions/index.js';
import { IdentityModule } from '../identity/index.js';
import { GetBudget, ReplaceBudget } from './application/budgets.js';
import { CopyPreviousBudget } from './application/copy-previous-budget.js';
import { ReassignBudgetCategory } from './application/reassign-budget-category.js';
import { BudgetsController } from './http/budgets.controller.js';
import { BudgetCategoryMergedListener } from './infrastructure/category-merged.listener.js';
import { PrismaBudgetRepository } from './infrastructure/prisma-budget-repository.js';
import { BUDGET_REPOSITORY } from './ports/budget-repository.js';
import { BUDGET_ACTUALS_READER } from './ports/actuals-reader.js';
import { BUDGET_CATALOG_READER } from './ports/catalog-reader.js';

/**
 * Módulo budgeting. Entra a main detrás de FEATURE_BUDGETING: sus rutas llevan
 * `@RequiresFeature('budgeting')` y responden 404 mientras el flag esté apagado.
 *
 * Importa solo la API pública de otros módulos: de `identity`, el guard que resuelve quién pide;
 * de `catalog`, `CatalogLookup`, que cumple el puerto `BudgetCatalogReader`; de `transactions`,
 * `TransactionsLookup`, que cumple `BudgetActualsReader` (lo real de cada mes).
 */
@Module({
  imports: [PrismaModule, IdentityModule, CatalogModule, TransactionsModule],
  controllers: [BudgetsController],
  providers: [
    GetBudget,
    ReplaceBudget,
    CopyPreviousBudget,
    ReassignBudgetCategory,
    BudgetCategoryMergedListener,
    { provide: BUDGET_REPOSITORY, useClass: PrismaBudgetRepository },
    { provide: BUDGET_CATALOG_READER, useExisting: CatalogLookup },
    { provide: BUDGET_ACTUALS_READER, useExisting: TransactionsLookup },
  ],
  exports: [],
})
export class BudgetingModule {}
