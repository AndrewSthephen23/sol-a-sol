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

/** Una categoría de la cuenta, para buscarla por nombre (la importación). */
export interface CategoryEntry extends CategoryReference {
  id: string;
  name: string;
  parentId: string | null;
}

/** Un método de pago de la cuenta, para buscarlo por alias (la importación). */
export interface PaymentMethodEntry extends PaymentMethodReference {
  id: string;
  alias: string;
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

  /** Todas las de la cuenta, archivadas incluidas. */
  async allCategories(userId: string): Promise<CategoryEntry[]> {
    const categories = await this.categories.list(userId, {});

    return categories.map((category) => ({
      id: category.id,
      name: category.name,
      type: category.type,
      parentId: category.parentId,
      archived: category.archivedAt !== null,
    }));
  }

  /** Todos los de la cuenta, archivados incluidos. */
  async allPaymentMethods(userId: string): Promise<PaymentMethodEntry[]> {
    const methods = await this.methods.list(userId, { includeArchived: true });

    return methods.map((method) => ({
      id: method.id,
      alias: method.alias,
      currency: method.currency,
      archived: method.archivedAt !== null,
    }));
  }

  async paymentMethod(userId: string, id: string): Promise<PaymentMethodReference | null> {
    const method = await this.methods.find(userId, id);
    if (method === null) return null;

    return { currency: method.currency, archived: method.archivedAt !== null };
  }
}
