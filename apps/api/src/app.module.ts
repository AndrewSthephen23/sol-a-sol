import { Module } from '@nestjs/common';

import { FeatureFlagsModule } from './shared/feature-flags/feature-flags.module.js';
import { HealthModule } from './shared/health/health.module.js';
import { PrismaModule } from './shared/prisma/prisma.module.js';
import { TimeModule } from './shared/time/time.module.js';
import { IdentityModule } from './modules/identity/identity.module.js';

@Module({
  imports: [PrismaModule, TimeModule, FeatureFlagsModule, HealthModule, IdentityModule],
})
export class AppModule {}
