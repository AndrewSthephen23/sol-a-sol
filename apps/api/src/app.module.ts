import { Module } from '@nestjs/common';

import { HealthModule } from './shared/health/health.module.js';
import { PrismaModule } from './shared/prisma/prisma.module.js';

@Module({
  imports: [PrismaModule, HealthModule],
})
export class AppModule {}
