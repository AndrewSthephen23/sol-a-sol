import { Injectable } from '@nestjs/common';
import type { AttemptRecord } from '@sol-a-sol/domain';

import { PrismaService } from '../../../shared/prisma/prisma.service.js';
import type { LoginThrottleRepository } from '../ports/login-throttle-repository.js';

const RECORD_FIELDS = { failures: true, lastFailureAt: true, lockedUntil: true } as const;

@Injectable()
export class PrismaLoginThrottleRepository implements LoginThrottleRepository {
  constructor(private readonly prisma: PrismaService) {}

  async find(key: string): Promise<AttemptRecord | null> {
    return this.prisma.loginThrottle.findUnique({ where: { key }, select: RECORD_FIELDS });
  }

  async save(key: string, record: AttemptRecord): Promise<void> {
    await this.prisma.loginThrottle.upsert({
      where: { key },
      create: { key, ...record },
      update: record,
    });
  }

  async clear(keys: string[]): Promise<void> {
    await this.prisma.loginThrottle.deleteMany({ where: { key: { in: keys } } });
  }

  async deleteOlderThan(instant: Date): Promise<number> {
    const { count } = await this.prisma.loginThrottle.deleteMany({
      where: { lastFailureAt: { lt: instant } },
    });

    return count;
  }
}
