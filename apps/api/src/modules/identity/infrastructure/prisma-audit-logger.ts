import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../../shared/prisma/prisma.service.js';
import type { AuditEntry, AuditLogger } from '../ports/audit-logger.js';

@Injectable()
export class PrismaAuditLogger implements AuditLogger {
  constructor(private readonly prisma: PrismaService) {}

  async record({ userId, action, entity, entityId, ip, userAgent }: AuditEntry): Promise<void> {
    await this.prisma.auditLog.create({
      data: { userId, action, entity, entityId, ip, userAgent },
    });
  }
}
