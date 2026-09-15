import { Module } from '@nestjs/common';

import { HealthModule } from './shared/health/health.module.js';

@Module({
  imports: [HealthModule],
})
export class AppModule {}
