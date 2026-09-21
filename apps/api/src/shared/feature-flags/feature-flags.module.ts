import { Global, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';

import { FeatureFlagGuard } from './feature-flag.guard.js';
import { FeatureFlagsService } from './feature-flags.js';

@Global()
@Module({
  providers: [
    FeatureFlagsService,
    FeatureFlagGuard,
    // Global: basta con marcar la ruta con `@RequiresFeature` para que quede protegida.
    // Si hubiera que recordar un `@UseGuards` en cada controlador, algún día se olvidaría
    // y un módulo apagado quedaría expuesto. Las rutas sin la marca no se ven afectadas.
    { provide: APP_GUARD, useExisting: FeatureFlagGuard },
  ],
  exports: [FeatureFlagsService, FeatureFlagGuard],
})
export class FeatureFlagsModule {}
