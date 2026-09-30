import type { Currency, PaymentMethodKind } from '@sol-a-sol/domain';

import type { CardPaymentMethod, CreditCardCatalogReader } from './catalog-reader.js';

/** Métodos de pago en memoria: cada uno pertenece a una cuenta, como en la base. */
export class FakeCreditCardCatalogReader implements CreditCardCatalogReader {
  private readonly methods = new Map<string, { userId: string; method: CardPaymentMethod }>();

  withMethod(
    userId: string,
    id: string,
    method: { kind?: PaymentMethodKind; currency?: Currency | null; archived?: boolean } = {},
  ): this {
    this.methods.set(id, {
      userId,
      method: {
        id,
        kind: method.kind ?? 'CREDIT_CARD',
        alias: `Tarjeta ${id}`,
        institution: 'BCP',
        last4: '1234',
        currency: method.currency ?? null,
        archived: method.archived ?? false,
      },
    });

    return this;
  }

  paymentMethod(
    userId: string,
    id: string,
  ): Promise<{ kind: PaymentMethodKind; currency: Currency | null; archived: boolean } | null> {
    const found = this.methods.get(id);
    if (found?.userId !== userId) return Promise.resolve(null);

    return Promise.resolve({
      kind: found.method.kind,
      currency: found.method.currency,
      archived: found.method.archived,
    });
  }

  allPaymentMethods(userId: string): Promise<CardPaymentMethod[]> {
    return Promise.resolve(
      [...this.methods.values()]
        .filter((entry) => entry.userId === userId)
        .map((entry) => ({ ...entry.method })),
    );
  }
}
