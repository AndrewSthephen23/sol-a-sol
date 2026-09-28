import { Injectable } from '@nestjs/common';
import type { Currency, PaymentMethodKind, TransactionType } from '@sol-a-sol/domain';

import {
  CreateCategory,
  CreatePaymentMethod,
  UpdateCategory,
  UpdatePaymentMethod,
} from '../../catalog/index.js';
import type { CatalogWriter } from '../ports/catalog-writer.js';

/** Cumple `CatalogWriter` con los casos de uso que `catalog` exporta en su API pública. */
@Injectable()
export class CatalogUseCasesWriter implements CatalogWriter {
  constructor(
    private readonly createCategoryUseCase: CreateCategory,
    private readonly updateCategory: UpdateCategory,
    private readonly createPaymentMethodUseCase: CreatePaymentMethod,
    private readonly updatePaymentMethod: UpdatePaymentMethod,
  ) {}

  async createCategory(
    userId: string,
    category: { type: TransactionType; name: string; parentId: string | null },
  ): Promise<string> {
    const created = await this.createCategoryUseCase.execute({
      userId,
      name: category.name,
      // Una subcategoría hereda el tipo de su madre: mandarlo igual sería redundante.
      ...(category.parentId === null ? { type: category.type } : { parentId: category.parentId }),
    });

    return created.id;
  }

  async restoreCategory(userId: string, id: string): Promise<void> {
    await this.updateCategory.execute({ userId, id, changes: { archived: false } });
  }

  async createPaymentMethod(
    userId: string,
    method: {
      kind: PaymentMethodKind;
      alias: string;
      institution: string | null;
      last4: string | null;
      currency: Currency | null;
    },
  ): Promise<string> {
    return (await this.createPaymentMethodUseCase.execute({ userId, ...method })).id;
  }

  async restorePaymentMethod(userId: string, id: string): Promise<void> {
    await this.updatePaymentMethod.execute({ userId, id, changes: { archived: false } });
  }
}
