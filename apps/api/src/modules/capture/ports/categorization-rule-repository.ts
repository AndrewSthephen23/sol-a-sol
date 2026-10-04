/** Una regla de categorización, como la guarda la base. */
export interface CategorizationRule {
  id: string;
  pattern: string;
  /** `searchKey(pattern)`: con esto se compara. */
  patternKey: string;
  categoryId: string;
  priority: number;
}

/** Las reglas de una cuenta. Cada método **exige el `userId`**. */
export interface CategorizationRuleRepository {
  list(userId: string): Promise<CategorizationRule[]>;
}

export const CATEGORIZATION_RULE_REPOSITORY = Symbol('CategorizationRuleRepository');
