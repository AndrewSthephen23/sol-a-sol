import { Injectable } from '@nestjs/common';

export interface HealthStatus {
  status: 'ok';
  uptimeSeconds: number;
}

@Injectable()
export class HealthService {
  /** Liveness: el proceso responde. La readiness (BD accesible) llega con Prisma en `/health/ready`. */
  check(): HealthStatus {
    return { status: 'ok', uptimeSeconds: Math.floor(process.uptime()) };
  }
}
