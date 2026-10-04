import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../../shared/prisma/prisma.service.js';
import type {
  CategorizationRule,
  CategorizationRuleRepository,
} from '../ports/categorization-rule-repository.js';

@Injectable()
export class PrismaCategorizationRuleRepository implements CategorizationRuleRepository {
  constructor(private readonly prisma: PrismaService) {}

  list(userId: string): Promise<CategorizationRule[]> {
    return this.prisma.categorizationRule.findMany({
      where: { userId },
      select: { id: true, pattern: true, patternKey: true, categoryId: true, priority: true },
      // Los ids son UUID v7: ordenarlos es ordenar por cuándo se crearon.
      orderBy: { id: 'asc' },
    });
  }
}
