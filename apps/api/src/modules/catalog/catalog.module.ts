import { Module } from '@nestjs/common';

/**
 * Módulo catalog. Entra a main detrás de FEATURE_CATALOG: sus rutas llevan
 * `@RequiresFeature('catalog')` y responden 404 mientras el flag esté apagado.
 */
@Module({
  controllers: [],
  providers: [],
  exports: [],
})
export class CatalogModule {}
