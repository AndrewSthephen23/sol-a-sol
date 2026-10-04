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

  /**
   * «Recordar para este comercio» (decisión 13): crea la regla con prioridad 0 o, si la cuenta ya
   * tiene una con ese patrón (sin tildes ni mayúsculas), le cambia la categoría.
   */
  remember(
    userId: string,
    rule: Pick<CategorizationRule, 'pattern' | 'patternKey' | 'categoryId'>,
  ): Promise<CategorizationRule>;
}

export const CATEGORIZATION_RULE_REPOSITORY = Symbol('CategorizationRuleRepository');
