import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
  NotFoundException,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { type FeatureModule, FeatureFlagsService } from './feature-flags.js';

const FEATURE_METADATA_KEY = 'sol-a-sol:feature-module';

/** Marca un controlador o una ruta como parte de un módulo detrás de feature flag. */
export const RequiresFeature = (module: FeatureModule): MethodDecorator & ClassDecorator =>
  SetMetadata(FEATURE_METADATA_KEY, module);

@Injectable()
export class FeatureFlagGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly featureFlags: FeatureFlagsService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const module = this.reflector.getAllAndOverride<FeatureModule | undefined>(
      FEATURE_METADATA_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (module === undefined || this.featureFlags.isEnabled(module)) {
      return true;
    }
    // 404 y no 403: un 403 confirmaría que el módulo existe.
    throw new NotFoundException();
  }
}
