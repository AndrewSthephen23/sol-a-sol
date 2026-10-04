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
/** Lo que se escribe de una regla. */
export type CategorizationRuleFields = Omit<CategorizationRule, 'id'>;

/** La cuenta ya tiene una regla con ese patrón, sin tildes ni mayúsculas. */
export class RulePatternTakenError extends Error {
  constructor() {
    super('The account already has a rule with that pattern.');
  }
}

export interface CategorizationRuleRepository {
  /** Primero la de mayor prioridad; con la misma, por patrón. */
  list(userId: string): Promise<CategorizationRule[]>;

  /** `null` si no existe **o es de otra cuenta**. */
  find(userId: string, id: string): Promise<CategorizationRule | null>;

  /** Lanza `RulePatternTakenError` si el patrón ya está en la cuenta. */
  create(userId: string, rule: CategorizationRuleFields): Promise<CategorizationRule>;

  /** `null` si no existe o es de otra cuenta. Lanza `RulePatternTakenError` como `create`. */
  update(
    userId: string,
    id: string,
    changes: Partial<CategorizationRuleFields>,
  ): Promise<CategorizationRule | null>;

  /** `false` si no existe o es de otra cuenta. */
  delete(userId: string, id: string): Promise<boolean>;

  /** Las reglas de una categoría fusionada pasan a la destino (ADR-0005). Cuántas. */
  reassignCategory(userId: string, fromId: string, intoId: string): Promise<number>;

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
