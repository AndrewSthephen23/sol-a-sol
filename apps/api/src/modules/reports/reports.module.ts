import { Module } from '@nestjs/common';

import { CatalogLookup, CatalogModule } from '../catalog/index.js';
import { IdentityModule } from '../identity/index.js';
import { TransactionsLookup, TransactionsModule } from '../transactions/index.js';
import { GetMonthlyDashboard } from './application/monthly-dashboard.js';
import { ReportsController } from './http/reports.controller.js';
import { REPORT_ACTUALS_READER, REPORT_CATALOG_READER } from './ports/report-readers.js';

/**
 * Módulo reports. Entra a main detrás de FEATURE_REPORTS: sus rutas llevan
 * `@RequiresFeature('reports')` y responden 404 mientras el flag esté apagado.
 *
 * Solo lectura y sin tablas propias (sección 6.3 del plan): lee lo real de `transactions`
 * (`TransactionsLookup`) y las categorías de `catalog` (`CatalogLookup`), por su API pública.
 */
@Module({
  imports: [IdentityModule, CatalogModule, TransactionsModule],
  controllers: [ReportsController],
  providers: [
    GetMonthlyDashboard,
    { provide: REPORT_ACTUALS_READER, useExisting: TransactionsLookup },
    { provide: REPORT_CATALOG_READER, useExisting: CatalogLookup },
  ],
  exports: [],
})
export class ReportsModule {}
