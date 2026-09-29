import { Module } from '@nestjs/common';

/**
 * Módulo budgeting. Entra a main detrás de FEATURE_BUDGETING: sus rutas llevan
 * `@RequiresFeature('budgeting')` y responden 404 mientras el flag esté apagado.
 */
@Module({
  controllers: [],
  providers: [],
  exports: [],
})
export class BudgetingModule {}
