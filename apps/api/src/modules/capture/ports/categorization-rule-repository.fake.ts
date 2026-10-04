import type {
  CategorizationRule,
  CategorizationRuleRepository,
} from './categorization-rule-repository.js';

/** Reglas en memoria. */
export class FakeCategorizationRuleRepository implements CategorizationRuleRepository {
  readonly rules: { userId: string; rule: CategorizationRule }[] = [];

  add(userId: string, rule: CategorizationRule): void {
    this.rules.push({ userId, rule });
  }

  remember(
    userId: string,
    rule: Pick<CategorizationRule, 'pattern' | 'patternKey' | 'categoryId'>,
  ): Promise<CategorizationRule> {
    const existing = this.rules.find(
      (entry) => entry.userId === userId && entry.rule.patternKey === rule.patternKey,
    );
    if (existing !== undefined) {
      existing.rule = { ...existing.rule, categoryId: rule.categoryId };
      return Promise.resolve({ ...existing.rule });
    }
    const created = { ...rule, id: `rule-${String(this.rules.length + 1)}`, priority: 0 };
    this.rules.push({ userId, rule: created });
    return Promise.resolve({ ...created });
  }

  list(userId: string): Promise<CategorizationRule[]> {
    return Promise.resolve(
      this.rules.filter((entry) => entry.userId === userId).map((entry) => ({ ...entry.rule })),
    );
  }
}
