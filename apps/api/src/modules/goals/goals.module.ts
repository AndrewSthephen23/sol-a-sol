import { Module } from '@nestjs/common';

/**
 * Módulo goals. Entra a main detrás de FEATURE_GOALS: sus rutas llevan
 * `@RequiresFeature('goals')` y responden 404 mientras el flag esté apagado.
 */
@Module({
  controllers: [],
  providers: [],
  exports: [],
})
export class GoalsModule {}
