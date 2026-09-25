import { Inject, Injectable } from '@nestjs/common';
import type { Currency, TransactionType } from '@sol-a-sol/domain';

import { CATEGORY_REPOSITORY, type CategoryRepository } from '../ports/category-repository.js';
import {
  PAYMENT_METHOD_REPOSITORY,
  type PaymentMethodRepository,
} from '../ports/payment-method-repository.js';

/** Lo que otro módulo necesita saber de una categoría para usarla. */
export interface CategoryReference {
  type: TransactionType;
  archived: boolean;
}

/** Lo que otro módulo necesita saber de un método de pago para usarlo. */
export interface PaymentMethodReference {
  /** Nula = acepta soles y dólares (tarjeta bimoneda, efectivo). */
  currency: Currency | null;
  archived: boolean;
}

/**
 * Consultas que `catalog` ofrece a otros módulos por su API pública (`index.ts`), para que
 * `transactions` no tenga que leer sus tablas ni importar su interior.
 *
 * Devuelve lo mínimo, no la entidad entera: así quien consulta no queda atado a su forma.
 * `null` si no existe **o es de otra cuenta**, igual que en el resto del módulo.
 */
@Injectable()
export class CatalogLookup {
  constructor(
    @Inject(CATEGORY_REPOSITORY) private readonly categories: CategoryRepository,
    @Inject(PAYMENT_METHOD_REPOSITORY) private readonly methods: PaymentMethodRepository,
  ) {}

  async category(userId: string, id: string): Promise<CategoryReference | null> {
    const category = await this.categories.find(userId, id);
    if (category === null) return null;

    return { type: category.type, archived: category.archivedAt !== null };
  }

  /**
   * La categoría y sus subcategorías, archivadas incluidas: filtrar por «Comida» trae también
   * «Comida > Delivery», y lo viejo sigue en sus categorías aunque se archiven.
   */
  async categoryFamily(userId: string, id: string): Promise<string[] | null> {
    const category = await this.categories.find(userId, id);
    if (category === null) return null;
    const children = await this.categories.children(userId, id);

    return [category.id, ...children.map((child) => child.id)];
  }

  async paymentMethod(userId: string, id: string): Promise<PaymentMethodReference | null> {
    const method = await this.methods.find(userId, id);
    if (method === null) return null;

    return { currency: method.currency, archived: method.archivedAt !== null };
  }
}
