import { searchKey, suggestCategory } from '@sol-a-sol/domain';

import type { paths } from '@/shared/api/schema.gen';

import { categoriesById } from '@/features/transactions/labels';
import type { FormError } from '@/features/transactions/movement-form-model';
import { formErrorFor } from '@/features/transactions/movement-form-model';
import type { Category } from '@/features/transactions/queries';

import type { Capture } from './capture-model';

export type Rule =
  paths['/api/v1/categorization-rules']['get']['responses'][200]['content']['application/json'][number];
export type RuleBody = NonNullable<
  paths['/api/v1/categorization-rules']['post']['requestBody']
>['content']['application/json'];

/**
 * La regla que hoy pone la categoría que tiene la captura, o `null`. La API no guarda qué regla
 * sugirió cada una (decidido el 2026-10-04): se calcula aquí con la **misma** regla del dominio
 * (`suggestCategory`), pasándole el id de cada regla en lugar de su categoría para saber cuál
 * gana. Si la que gana da otra categoría (la eligió alguien a mano), no se dice nada.
 */
export function ruleBehind(
  capture: Capture,
  rules: readonly Rule[],
  categories: readonly Category[],
): Rule | null {
  if (capture.categoryId === null) return null;
  const byId = categoriesById(categories);
  const candidates = rules.flatMap((rule) => {
    const category = byId.get(rule.categoryId);
    if (category === undefined) return [];
    return [
      {
        categoryId: rule.id,
        categoryType: category.type,
        categoryArchived: category.archivedAt !== null,
        patternKey: searchKey(rule.pattern),
        priority: rule.priority,
      },
    ];
  });
  const winnerId = suggestCategory(
    candidates,
    capture.type,
    capture.merchant,
    capture.raw?.rawText ?? null,
  );
  const winner = rules.find(({ id }) => id === winnerId);
  return winner?.categoryId === capture.categoryId ? winner : null;
}

/** Lo que se escribe al crear o corregir una regla: todo como texto. */
export interface RuleValues {
  pattern: string;
  categoryId: string;
  priority: string;
}

export type RuleField = keyof RuleValues;

/** El tope de un entero de la base: la prioridad no tiene otro. */
const PRIORITY_MAX = 2_147_483_647;

export function ruleValuesFor(rule: Rule | null): RuleValues {
  return rule === null
    ? { pattern: '', categoryId: '', priority: '0' }
    : { pattern: rule.pattern, categoryId: rule.categoryId, priority: String(rule.priority) };
}

export function checkRule(
  values: RuleValues,
): { body: RuleBody } | { errors: Partial<Record<RuleField, string>> } {
  const errors: Partial<Record<RuleField, string>> = {};
  const pattern = values.pattern.trim();
  if (pattern === '') errors.pattern = 'Escribe qué debe contener el comercio.';
  if (values.categoryId === '') errors.categoryId = 'Elige una categoría.';
  const priority = values.priority.trim();
  if (!/^\d{1,10}$/u.test(priority) || Number(priority) > PRIORITY_MAX) {
    errors.priority = 'La prioridad es un número entero, 0 o más.';
  }
  if (Object.keys(errors).length > 0) return { errors };

  return { body: { pattern, categoryId: values.categoryId, priority: Number(priority) } };
}

/** Los errores de una regla junto a su campo; los de la categoría, como en los movimientos. */
export function ruleErrorFor(code: string | null): FormError<RuleField> | null {
  if (code === 'RULE_PATTERN_TAKEN') {
    return { field: 'pattern', message: 'Ya tienes una regla para ese texto: corrige esa.' };
  }
  const placed = formErrorFor(code);
  if (placed === null) return null;
  return placed.field === 'categoryId'
    ? { field: 'categoryId', message: placed.message }
    : { message: placed.message };
}
