import { Module } from '@nestjs/common';

/**
 * Módulo capture. Entra a main detrás de FEATURE_CAPTURE: sus rutas llevan
 * `@RequiresFeature('capture')` y responden 404 mientras el flag esté apagado.
 */
@Module({
  controllers: [],
  providers: [],
  exports: [],
})
export class CaptureModule {}
