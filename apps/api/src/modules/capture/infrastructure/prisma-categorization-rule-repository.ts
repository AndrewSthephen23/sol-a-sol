import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../../shared/prisma/prisma.service.js';
import type {
  CategorizationRule,
  CategorizationRuleRepository,
} from '../ports/categorization-rule-repository.js';

const RULE_FIELDS = {
  id: true,
  pattern: true,
  patternKey: true,
  categoryId: true,
  priority: true,
} as const;

@Injectable()
export class PrismaCategorizationRuleRepository implements CategorizationRuleRepository {
  constructor(private readonly prisma: PrismaService) {}

  remember(
    userId: string,
    rule: Pick<CategorizationRule, 'pattern' | 'patternKey' | 'categoryId'>,
  ): Promise<CategorizationRule> {
    // Atómico en la base: dos confirmaciones a la vez con «Recordar» no chocan por el patrón.
    return this.prisma.categorizationRule.upsert({
      where: { userId_patternKey: { userId, patternKey: rule.patternKey } },
      create: { userId, ...rule },
      update: { categoryId: rule.categoryId },
      select: RULE_FIELDS,
    });
  }

  list(userId: string): Promise<CategorizationRule[]> {
    return this.prisma.categorizationRule.findMany({
      where: { userId },
      select: RULE_FIELDS,
      // Los ids son UUID v7: ordenarlos es ordenar por cuándo se crearon.
      orderBy: { id: 'asc' },
    });
  }
}
