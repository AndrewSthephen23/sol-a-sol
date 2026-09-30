import type { CreditCardSettings } from '@sol-a-sol/domain';

import { CreditCardAlreadyConfiguredError } from '../domain/errors.js';
import type { CreditCard, CreditCardRepository } from './credit-card-repository.js';

/** Tarjetas en memoria, con el mismo único por método de pago que la base. */
export class FakeCreditCardRepository implements CreditCardRepository {
  private readonly cards: { userId: string; card: CreditCard }[] = [];
  private nextId = 1;

  list(userId: string): Promise<CreditCard[]> {
    return Promise.resolve(
      this.cards.filter((entry) => entry.userId === userId).map((entry) => ({ ...entry.card })),
    );
  }

  find(userId: string, id: string): Promise<CreditCard | null> {
    const found = this.cards.find((entry) => entry.card.id === id && entry.userId === userId);

    return Promise.resolve(found === undefined ? null : { ...found.card });
  }

  create(
    userId: string,
    paymentMethodId: string,
    settings: CreditCardSettings,
  ): Promise<CreditCard> {
    if (this.cards.some((entry) => entry.card.paymentMethodId === paymentMethodId)) {
      return Promise.reject(new CreditCardAlreadyConfiguredError());
    }
    const card = { ...settings, id: `card-${String(this.nextId++)}`, paymentMethodId };
    this.cards.push({ userId, card });

    return Promise.resolve({ ...card });
  }

  update(userId: string, id: string, settings: CreditCardSettings): Promise<CreditCard | null> {
    const found = this.cards.find((entry) => entry.card.id === id && entry.userId === userId);
    if (found === undefined) return Promise.resolve(null);
    found.card = { ...found.card, ...settings };

    return this.find(userId, id);
  }
}
