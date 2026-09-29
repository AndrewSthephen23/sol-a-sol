import { Module } from '@nestjs/common';

import { PrismaModule } from '../../shared/prisma/prisma.module.js';
import { CatalogLookup, CatalogModule } from '../catalog/index.js';
import { IdentityModule } from '../identity/index.js';
import { GetBudget, ReplaceBudget } from './application/budgets.js';
import { BudgetsController } from './http/budgets.controller.js';
import { PrismaBudgetRepository } from './infrastructure/prisma-budget-repository.js';
import { BUDGET_REPOSITORY } from './ports/budget-repository.js';
import { BUDGET_CATALOG_READER } from './ports/catalog-reader.js';

/**
 * Módulo budgeting. Entra a main detrás de FEATURE_BUDGETING: sus rutas llevan
 * `@RequiresFeature('budgeting')` y responden 404 mientras el flag esté apagado.
 *
 * Importa solo la API pública de otros módulos: de `identity`, el guard que resuelve quién pide;
 * de `catalog`, `CatalogLookup`, que cumple el puerto `BudgetCatalogReader`.
 */
@Module({
  imports: [PrismaModule, IdentityModule, CatalogModule],
  controllers: [BudgetsController],
  providers: [
    GetBudget,
    ReplaceBudget,
    { provide: BUDGET_REPOSITORY, useClass: PrismaBudgetRepository },
    { provide: BUDGET_CATALOG_READER, useExisting: CatalogLookup },
  ],
  exports: [],
})
export class BudgetingModule {}
