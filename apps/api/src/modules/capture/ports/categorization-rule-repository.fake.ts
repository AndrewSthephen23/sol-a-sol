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

  list(userId: string): Promise<CategorizationRule[]> {
    return Promise.resolve(
      this.rules.filter((entry) => entry.userId === userId).map((entry) => ({ ...entry.rule })),
    );
  }
}
