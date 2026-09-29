import { DomainError } from '@sol-a-sol/domain';

/**
 * La categoría de una partida no existe o es de otra cuenta. Mismo código que el de `catalog` y
 * `transactions`: para quien llama es el mismo error, venga del módulo que venga (404).
 */
export class BudgetCategoryNotFoundError extends DomainError {
  readonly code = 'CATEGORY_NOT_FOUND';

  constructor() {
    super('Category not found.');
  }
}
