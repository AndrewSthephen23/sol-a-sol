import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../../shared/prisma/prisma.service.js';
import type { AuditLogCleaner } from '../ports/audit-log-cleaner.js';
import type { AuditEntry, AuditLogger } from '../ports/audit-logger.js';

@Injectable()
export class PrismaAuditLogger implements AuditLogger, AuditLogCleaner {
  constructor(private readonly prisma: PrismaService) {}

  async record({ userId, action, entity, entityId, ip, userAgent }: AuditEntry): Promise<void> {
    await this.prisma.auditLog.create({
      data: { userId, action, entity, entityId, ip, userAgent },
    });
  }

  async deleteOlderThan(instant: Date): Promise<number> {
    const { count } = await this.prisma.auditLog.deleteMany({ where: { at: { lt: instant } } });

    return count;
  }
}
