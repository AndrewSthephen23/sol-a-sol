import type { CategorizationRuleCandidate } from '@sol-a-sol/domain';

import type { CaptureCatalogCategory } from '../ports/catalog-reader.js';
import type { CategorizationRule } from '../ports/categorization-rule-repository.js';

/**
 * Las reglas de la cuenta con el tipo de su categoría y si está archivada, para `suggestCategory`.
 * Una regla cuya categoría ya no está en el catálogo se salta.
 */
export function ruleCandidates(
  rules: readonly CategorizationRule[],
  categories: readonly CaptureCatalogCategory[],
): CategorizationRuleCandidate[] {
  const categoryById = new Map(categories.map((category) => [category.id, category]));

  return rules.flatMap((rule): CategorizationRuleCandidate[] => {
    const category = categoryById.get(rule.categoryId);
    if (category === undefined) return [];
    return [
      {
        categoryId: rule.categoryId,
        categoryType: category.type,
        categoryArchived: category.archived,
        patternKey: rule.patternKey,
        priority: rule.priority,
      },
    ];
  });
}
