import { Module } from '@nestjs/common';

import { FeatureFlagsModule } from './shared/feature-flags/feature-flags.module.js';
import { LoggingModule } from './shared/logging/logging.module.js';
import { HealthModule } from './shared/health/health.module.js';
import { OpenApiModule } from './shared/openapi/openapi.module.js';
import { PrismaModule } from './shared/prisma/prisma.module.js';
import { ThrottlingModule } from './shared/throttling/throttling.module.js';
import { TimeModule } from './shared/time/time.module.js';
import { IdentityModule } from './modules/identity/identity.module.js';

@Module({
  imports: [
    LoggingModule,
    ThrottlingModule,
    PrismaModule,
    TimeModule,
    FeatureFlagsModule,
    HealthModule,
    OpenApiModule,
    IdentityModule,
  ],
})
export class AppModule {}
