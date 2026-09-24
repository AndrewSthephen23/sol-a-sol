import { Inject, Injectable, Logger } from '@nestjs/common';
import { TRANSACTION_TYPES } from '@sol-a-sol/domain';

import { ListAccountIds } from '../../identity/index.js';
import { DEFAULT_CATEGORIES } from '../domain/default-categories.js';
import {
  CATEGORY_REPOSITORY,
  type CategoryRepository,
  type CategorySeed,
} from '../ports/category-repository.js';

/** La semilla con todos sus datos: cada subcategoría toma el tipo y el color de su madre. */
function defaultSeed(): CategorySeed[] {
  return TRANSACTION_TYPES.flatMap((type) =>
    DEFAULT_CATEGORIES[type].map(({ name, color, icon, children = [] }) => ({
      type,
      name,
      color,
      icon,
      children: children.map((child) => ({ ...child, color })),
    })),
  );
}

/**
 * Da las categorías iniciales a una cuenta **que no tiene ninguna**. Si ya tiene alguna no toca
 * nada, así que correrlo dos veces no duplica: la semilla es idempotente.
 */
@Injectable()
export class SeedDefaultCategories {
  constructor(@Inject(CATEGORY_REPOSITORY) private readonly categories: CategoryRepository) {}

  /** `true` si la sembró; `false` si la cuenta ya tenía categorías. */
  async execute(userId: string): Promise<boolean> {
    return this.categories.seedIfEmpty(userId, defaultSeed());
  }
}

export interface SeedSummary {
  seeded: number;
  skipped: number;
}

/**
 * `pnpm db:seed`: recorre todas las cuentas y siembra las que no tienen ninguna categoría. Existe
 * para las cuentas creadas antes de la semilla; las nuevas la reciben al registrarse.
 */
@Injectable()
export class SeedAccountsWithoutCategories {
  private readonly logger = new Logger(SeedAccountsWithoutCategories.name);

  constructor(
    private readonly accounts: ListAccountIds,
    private readonly seed: SeedDefaultCategories,
  ) {}

  async execute(): Promise<SeedSummary> {
    const summary: SeedSummary = { seeded: 0, skipped: 0 };
    for (const userId of await this.accounts.execute()) {
      if (await this.seed.execute(userId)) {
        summary.seeded += 1;
        this.logger.log(`Categorías iniciales creadas para la cuenta ${userId}.`);
      } else {
        summary.skipped += 1;
      }
    }

    return summary;
  }
}
