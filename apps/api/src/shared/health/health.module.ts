import { Module } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service.js';
import { DatabasePing } from './database-ping.js';
import { HealthController } from './health.controller.js';
import { HealthService } from './health.service.js';

@Module({
  controllers: [HealthController],
  providers: [HealthService, { provide: DatabasePing, useExisting: PrismaService }],
})
export class HealthModule {}
