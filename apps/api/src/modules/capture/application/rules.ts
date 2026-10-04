import { Inject, Injectable } from '@nestjs/common';
import { ArchivedCategoryError, searchKey, suggestCategory } from '@sol-a-sol/domain';

import {
  CaptureCategoryNotFoundError,
  CategorizationRuleNotFoundError,
  CategorizationRulePatternTakenError,
} from '../domain/errors.js';
import { CAPTURE_REPOSITORY, type CaptureRepository } from '../ports/capture-repository.js';
import { CAPTURE_CATALOG_READER, type CaptureCatalogReader } from '../ports/catalog-reader.js';
import {
  CATEGORIZATION_RULE_REPOSITORY,
  type CategorizationRule,
  type CategorizationRuleFields,
  type CategorizationRuleRepository,
  RulePatternTakenError,
} from '../ports/categorization-rule-repository.js';
import { ruleCandidates } from './rule-candidates.js';

/** La bandeja: por revisar y duplicadas. */
const INBOX = ['PENDING', 'DUPLICATE'] as const;

export interface CategorizationRuleInput {
  pattern: string;
  categoryId: string;
  priority: number;
}

/** Las reglas de la cuenta, primero la de mayor prioridad. */
@Injectable()
export class ListCategorizationRules {
  constructor(
    @Inject(CATEGORIZATION_RULE_REPOSITORY) private readonly rules: CategorizationRuleRepository,
  ) {}

  execute(userId: string): Promise<CategorizationRule[]> {
    return this.rules.list(userId);
  }
}

/**
 * Lo que comparten crear y cambiar una regla: la categoría tiene que ser de la cuenta y estar
 * activa (de cualquier tipo: la regla no tiene uno), y después se vuelve a sugerir en la bandeja.
 */
abstract class RuleWriter {
  constructor(
    protected readonly rules: CategorizationRuleRepository,
    private readonly captures: CaptureRepository,
    private readonly catalog: CaptureCatalogReader,
  ) {}

  protected async assertCategoryUsable(userId: string, categoryId: string): Promise<void> {
    const category = await this.catalog.category(userId, categoryId);
    if (category === null) throw new CaptureCategoryNotFoundError();
    if (category.archived) throw new ArchivedCategoryError();
  }

  /** Un patrón repetido en la cuenta responde 409 (decidido el 2026-10-04). */
  protected async patternMustBeFree<T>(write: () => Promise<T>): Promise<T> {
    try {
      return await write();
    } catch (error) {
      if (error instanceof RulePatternTakenError) throw new CategorizationRulePatternTakenError();
      throw error;
    }
  }

  /**
   * Vuelve a sugerir la categoría de las capturas de la bandeja **que no tienen** (decidido el
   * 2026-10-04): las que ya tienen una, sugerida antes o elegida a mano, no se tocan. Pesan todas
   * las reglas de la cuenta, como al recibir una captura. Una que otra pestaña confirmó o descartó
   * entretanto no se toca.
   */
  protected async suggestAgain(userId: string): Promise<void> {
    const waiting = await this.captures.listUncategorizedInInbox(userId);
    if (waiting.length === 0) return;
    const [rules, categories] = await Promise.all([
      this.rules.list(userId),
      this.catalog.allCategories(userId),
    ]);
    const candidates = ruleCandidates(rules, categories);

    for (const capture of waiting) {
      const rawText = capture.rawPayload?.rawText ?? null;
      const categoryId = suggestCategory(candidates, capture.type, capture.merchant, rawText);
      if (categoryId !== null) {
        await this.captures.update(userId, capture.id, { categoryId }, INBOX);
      }
    }
  }
}

/** Crea una regla (decisión 12) y la aplica a lo que espera en la bandeja sin categoría. */
@Injectable()
export class CreateCategorizationRule extends RuleWriter {
  constructor(
    @Inject(CATEGORIZATION_RULE_REPOSITORY) rules: CategorizationRuleRepository,
    @Inject(CAPTURE_REPOSITORY) captures: CaptureRepository,
    @Inject(CAPTURE_CATALOG_READER) catalog: CaptureCatalogReader,
  ) {
    super(rules, captures, catalog);
  }

  async execute(userId: string, input: CategorizationRuleInput): Promise<CategorizationRule> {
    await this.assertCategoryUsable(userId, input.categoryId);
    const rule = await this.patternMustBeFree(() =>
      this.rules.create(userId, { ...input, patternKey: searchKey(input.pattern) }),
    );
    await this.suggestAgain(userId);

    return rule;
  }
}

/** Cambia una regla: patrón, categoría o prioridad. Una categoría **nueva** se revisa. */
@Injectable()
export class UpdateCategorizationRule extends RuleWriter {
  constructor(
    @Inject(CATEGORIZATION_RULE_REPOSITORY) rules: CategorizationRuleRepository,
    @Inject(CAPTURE_REPOSITORY) captures: CaptureRepository,
    @Inject(CAPTURE_CATALOG_READER) catalog: CaptureCatalogReader,
  ) {
    super(rules, captures, catalog);
  }

  async execute(
    userId: string,
    id: string,
    changes: Partial<CategorizationRuleInput>,
  ): Promise<CategorizationRule> {
    const rule = await this.rules.find(userId, id);
    if (rule === null) throw new CategorizationRuleNotFoundError();
    if (changes.categoryId !== undefined && changes.categoryId !== rule.categoryId) {
      await this.assertCategoryUsable(userId, changes.categoryId);
    }

    const fields: Partial<CategorizationRuleFields> = {
      ...changes,
      ...(changes.pattern === undefined ? {} : { patternKey: searchKey(changes.pattern) }),
    };
    const updated = await this.patternMustBeFree(() => this.rules.update(userId, id, fields));
    if (updated === null) throw new CategorizationRuleNotFoundError();
    await this.suggestAgain(userId);

    return updated;
  }
}

/** Borra una regla. Lo que ya sugirió se queda: la sugerencia es de la captura. */
@Injectable()
export class DeleteCategorizationRule {
  constructor(
    @Inject(CATEGORIZATION_RULE_REPOSITORY) private readonly rules: CategorizationRuleRepository,
  ) {}

  async execute(userId: string, id: string): Promise<void> {
    if (!(await this.rules.delete(userId, id))) throw new CategorizationRuleNotFoundError();
  }
}

/**
 * Sigue una fusión de categorías (ADR-0005; decidido el 2026-10-04): las reglas y las capturas sin
 * confirmar de la origen pasan a la destino. Si no, la regla dejaría de sugerir y la captura no se
 * podría confirmar, porque la origen queda archivada. Lo dispara `catalog.category.merged`.
 * Repetirlo no cambia nada.
 */
@Injectable()
export class FollowCategoryMerge {
  constructor(
    @Inject(CATEGORIZATION_RULE_REPOSITORY) private readonly rules: CategorizationRuleRepository,
    @Inject(CAPTURE_REPOSITORY) private readonly captures: CaptureRepository,
  ) {}

  async execute({
    userId,
    fromId,
    intoId,
  }: {
    userId: string;
    fromId: string;
    intoId: string;
  }): Promise<void> {
    await this.rules.reassignCategory(userId, fromId, intoId);
    await this.captures.reassignCategory(userId, fromId, intoId);
  }
}
