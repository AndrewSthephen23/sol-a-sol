import { Injectable } from '@nestjs/common';

import { DatabasePing } from './database-ping.js';

export interface HealthStatus {
  status: 'ok';
  uptimeSeconds: number;
}

export interface ReadinessStatus {
  status: 'ok' | 'error';
  checks: {
    database: 'up' | 'down';
  };
}

@Injectable()
export class HealthService {
  constructor(private readonly databasePing: DatabasePing) {}

  /** Liveness: el proceso responde. */
  check(): HealthStatus {
    return { status: 'ok', uptimeSeconds: Math.floor(process.uptime()) };
  }

  /** Readiness: la API puede atender tráfico porque la base de datos responde. */
  async checkReadiness(): Promise<ReadinessStatus> {
    try {
      await this.databasePing.ping();
      return { status: 'ok', checks: { database: 'up' } };
    } catch {
      return { status: 'error', checks: { database: 'down' } };
    }
  }
}
