import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';

import { SkipThrottle } from '@nestjs/throttler';

import { HealthService, type HealthStatus, type ReadinessStatus } from './health.service.js';

// Sin tope de peticiones: Docker y el balanceador los consultan cada pocos segundos, y son dos
// respuestas que no cuestan nada.
@SkipThrottle()
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
