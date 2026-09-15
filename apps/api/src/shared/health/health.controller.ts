import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';

import { HealthService, type HealthStatus, type ReadinessStatus } from './health.service.js';

@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get()
  check(): HealthStatus {
    return this.healthService.check();
  }

  @Get('ready')
  async ready(): Promise<ReadinessStatus> {
    const readiness = await this.healthService.checkReadiness();
    if (readiness.status !== 'ok') {
      throw new ServiceUnavailableException(readiness);
    }
    return readiness;
  }
}
