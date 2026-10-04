import {
  type CategorizationRule,
  type CategorizationRuleFields,
  type CategorizationRuleRepository,
  RulePatternTakenError,
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
      this.rules
        .filter((entry) => entry.userId === userId)
        .map((entry) => ({ ...entry.rule }))
        .toSorted((a, b) => b.priority - a.priority || a.patternKey.localeCompare(b.patternKey)),
    );
  }

  find(userId: string, id: string): Promise<CategorizationRule | null> {
    const found = this.rules.find((entry) => entry.userId === userId && entry.rule.id === id);
    return Promise.resolve(found === undefined ? null : { ...found.rule });
  }

  create(userId: string, rule: CategorizationRuleFields): Promise<CategorizationRule> {
    if (this.taken(userId, rule.patternKey, null)) {
      return Promise.reject(new RulePatternTakenError());
    }
    const created = { ...rule, id: `rule-${String(this.rules.length + 1)}` };
    this.rules.push({ userId, rule: created });
    return Promise.resolve({ ...created });
  }

  update(
    userId: string,
    id: string,
    changes: Partial<CategorizationRuleFields>,
  ): Promise<CategorizationRule | null> {
    const found = this.rules.find((entry) => entry.userId === userId && entry.rule.id === id);
    if (found === undefined) return Promise.resolve(null);
    if (changes.patternKey !== undefined && this.taken(userId, changes.patternKey, id)) {
      return Promise.reject(new RulePatternTakenError());
    }
    found.rule = { ...found.rule, ...changes };
    return Promise.resolve({ ...found.rule });
  }

  delete(userId: string, id: string): Promise<boolean> {
    const index = this.rules.findIndex((entry) => entry.userId === userId && entry.rule.id === id);
    if (index === -1) return Promise.resolve(false);
    this.rules.splice(index, 1);
    return Promise.resolve(true);
  }

  reassignCategory(userId: string, fromId: string, intoId: string): Promise<number> {
    const moved = this.rules.filter(
      (entry) => entry.userId === userId && entry.rule.categoryId === fromId,
    );
    for (const entry of moved) entry.rule = { ...entry.rule, categoryId: intoId };
    return Promise.resolve(moved.length);
  }

  private taken(userId: string, patternKey: string, exceptId: string | null): boolean {
    return this.rules.some(
      (entry) =>
        entry.userId === userId &&
        entry.rule.id !== exceptId &&
        entry.rule.patternKey === patternKey,
    );
  }
}
