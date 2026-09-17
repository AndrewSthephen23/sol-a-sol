import { Global, Module } from '@nestjs/common';

import { FeatureFlagGuard } from './feature-flag.guard.js';
import { FeatureFlagsService } from './feature-flags.js';

@Global()
@Module({
  providers: [FeatureFlagsService, FeatureFlagGuard],
  exports: [FeatureFlagsService, FeatureFlagGuard],
})
export class FeatureFlagsModule {}
