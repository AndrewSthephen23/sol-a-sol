import { Controller, Get, Header } from '@nestjs/common';

import { FeatureFlagsService } from '../feature-flags/feature-flags.js';
import { appVersion } from './app-version.js';
import { buildOpenApiDocument } from './openapi.js';

@Controller('openapi.json')
export class OpenApiController {
  constructor(private readonly featureFlags: FeatureFlagsService) {}

  /** `no-store`: el documento cambia con la versión y con los feature flags. */
  @Get()
  @Header('Cache-Control', 'no-store')
  document(): Record<string, unknown> {
    return buildOpenApiDocument({
      version: appVersion(),
      isFeatureEnabled: (module) => this.featureFlags.isEnabled(module),
    });
  }
}
