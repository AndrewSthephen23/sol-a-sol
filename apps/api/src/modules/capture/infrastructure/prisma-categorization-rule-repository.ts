import { Injectable } from '@nestjs/common';

import { Prisma } from '../../../generated/prisma/client.js';
import { PrismaService } from '../../../shared/prisma/prisma.service.js';
import {
  type CategorizationRule,
  type CategorizationRuleFields,
  type CategorizationRuleRepository,
  RulePatternTakenError,
} from '../ports/categorization-rule-repository.js';

/** `select` explícito: `userId` no sale del módulo. */
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

  list(userId: string): Promise<CategorizationRule[]> {
    return this.prisma.categorizationRule.findMany({
      where: { userId },
      select: RULE_FIELDS,
      orderBy: [{ priority: 'desc' }, { patternKey: 'asc' }],
    });
  }

  find(userId: string, id: string): Promise<CategorizationRule | null> {
    return this.prisma.categorizationRule.findFirst({
      where: { id, userId },
      select: RULE_FIELDS,
    });
  }

  create(userId: string, rule: CategorizationRuleFields): Promise<CategorizationRule> {
    return patternMustBeFree(() =>
      this.prisma.categorizationRule.create({ data: { userId, ...rule }, select: RULE_FIELDS }),
    );
  }

  async update(
    userId: string,
    id: string,
    changes: Partial<CategorizationRuleFields>,
  ): Promise<CategorizationRule | null> {
    // `userId` va en el propio UPDATE: una regla ajena no coincide aunque alguien adivine su id.
    const { count } = await patternMustBeFree(() =>
      this.prisma.categorizationRule.updateMany({ where: { id, userId }, data: changes }),
    );
    if (count === 0) return null;

    return this.find(userId, id);
  }

  async delete(userId: string, id: string): Promise<boolean> {
    const { count } = await this.prisma.categorizationRule.deleteMany({ where: { id, userId } });

    return count > 0;
  }

  async reassignCategory(userId: string, fromId: string, intoId: string): Promise<number> {
    const { count } = await this.prisma.categorizationRule.updateMany({
      where: { userId, categoryId: fromId },
      data: { categoryId: intoId },
    });

    return count;
  }

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
}

/** La única restricción única que puede chocar es `(user_id, pattern_key)`. */
async function patternMustBeFree<T>(write: () => Promise<T>): Promise<T> {
  try {
    return await write();
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new RulePatternTakenError();
    }
    throw error;
  }
}
