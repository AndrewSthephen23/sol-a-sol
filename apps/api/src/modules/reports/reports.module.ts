import { Module } from '@nestjs/common';

import { FeatureFlagsService } from '../../shared/feature-flags/feature-flags.js';
import { BudgetingLookup, BudgetingModule } from '../budgeting/index.js';
import { CaptureLookup, CaptureModule } from '../capture/index.js';
import { CatalogLookup, CatalogModule } from '../catalog/index.js';
import { CreditCardsLookup, CreditCardsModule } from '../credit-cards/index.js';
import { GoalsLookup, GoalsModule } from '../goals/index.js';
import { IdentityModule } from '../identity/index.js';
import { TransactionsLookup, TransactionsModule } from '../transactions/index.js';
import { GetAnnualSummary } from './application/annual-summary.js';
import { GetMonthlyDashboard } from './application/monthly-dashboard.js';
import { GetMonthlySummary } from './application/monthly-summary.js';
import { ReportsController } from './http/reports.controller.js';
import {
  REPORT_ACTUALS_READER,
  REPORT_BUDGET_READER,
  REPORT_CAPTURES_READER,
  REPORT_CARDS_READER,
  REPORT_CATALOG_READER,
  REPORT_FEATURE_FLAGS,
  REPORT_GOALS_READER,
} from './ports/report-readers.js';

/**
 * Módulo reports. Entra a main detrás de FEATURE_REPORTS: sus rutas llevan
 * `@RequiresFeature('reports')` y responden 404 mientras el flag esté apagado.
 *
 * Solo lectura y sin tablas propias (sección 6.3 del plan): lee lo real de `transactions`
 * (`TransactionsLookup`), las categorías de `catalog` (`CatalogLookup`), las partidas de
 * `budgeting` (`BudgetingLookup`), las tarjetas de `credit-cards` (`CreditCardsLookup`) y las metas
 * de `goals` (`GoalsLookup`) y las capturas por revisar de `capture` (`CaptureLookup`), cada una por su API pública y detrás de un puerto propio. Qué módulos
 * están encendidos lo dice `FeatureFlagsService`, también detrás de un puerto.
 */
@Module({
  imports: [
    IdentityModule,
    CatalogModule,
    TransactionsModule,
    BudgetingModule,
    CreditCardsModule,
    GoalsModule,
    CaptureModule,
  ],
  controllers: [ReportsController],
  providers: [
    GetMonthlyDashboard,
    GetMonthlySummary,
    GetAnnualSummary,
    { provide: REPORT_ACTUALS_READER, useExisting: TransactionsLookup },
    { provide: REPORT_CATALOG_READER, useExisting: CatalogLookup },
    { provide: REPORT_BUDGET_READER, useExisting: BudgetingLookup },
    { provide: REPORT_CARDS_READER, useExisting: CreditCardsLookup },
    { provide: REPORT_GOALS_READER, useExisting: GoalsLookup },
    { provide: REPORT_CAPTURES_READER, useExisting: CaptureLookup },
    { provide: REPORT_FEATURE_FLAGS, useExisting: FeatureFlagsService },
  ],
  exports: [],
})
export class ReportsModule {}
