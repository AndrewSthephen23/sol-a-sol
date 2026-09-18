import { Module } from '@nestjs/common';

/**
 * Módulo identity. Entra a main detrás de FEATURE_IDENTITY: sus rutas llevan
 * `@RequiresFeature('identity')` y responden 404 mientras el flag esté apagado.
 */
@Module({
  controllers: [],
  providers: [],
  exports: [],
})
export class IdentityModule {}
