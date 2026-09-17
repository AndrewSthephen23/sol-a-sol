import { Module } from '@nestjs/common';

import { FeatureFlagsModule } from './shared/feature-flags/feature-flags.module.js';
import { HealthModule } from './shared/health/health.module.js';
import { PrismaModule } from './shared/prisma/prisma.module.js';

@Module({
  imports: [PrismaModule, FeatureFlagsModule, HealthModule],
})
export class AppModule {}
