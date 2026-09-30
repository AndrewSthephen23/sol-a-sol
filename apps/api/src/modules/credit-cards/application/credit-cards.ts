import { Inject, Injectable } from '@nestjs/common';
import {
  assertConfigurableMethod,
  assertCreditCardSettings,
  type Clock,
  type CreditCardSettings,
  today,
} from '@sol-a-sol/domain';

import { CLOCK } from '../../../shared/time/system-clock.js';
import { CreditCardNotFoundError, CreditCardPaymentMethodNotFoundError } from '../domain/errors.js';
import {
  type CardPaymentMethod,
  CREDIT_CARD_CATALOG_READER,
  type CreditCardCatalogReader,
} from '../ports/catalog-reader.js';
import {
  type CreditCard,
  CREDIT_CARD_REPOSITORY,
  type CreditCardRepository,
} from '../ports/credit-card-repository.js';

/** Una tarjeta con lo que la identifica, leído de `catalog` al consultar: no se copia. */
export interface CreditCardView {
  card: CreditCard;
  paymentMethod: CardPaymentMethod;
}

/**
 * Las tarjetas configuradas de la cuenta, **archivadas incluidas** (2026-09-29): una tarjeta
 * cuyo método se archivó conserva su configuración y se sigue viendo, marcada como archivada.
 */
@Injectable()
export class ListCreditCards {
  constructor(
    @Inject(CREDIT_CARD_REPOSITORY) private readonly cards: CreditCardRepository,
    @Inject(CREDIT_CARD_CATALOG_READER) private readonly catalog: CreditCardCatalogReader,
  ) {}

  async execute(userId: string): Promise<CreditCardView[]> {
    const [cards, methods] = await Promise.all([
      this.cards.list(userId),
      this.catalog.allPaymentMethods(userId),
    ]);

    return withMethods(cards, methods);
  }
}

/**
 * Configura un método de pago `CREDIT_CARD` **propio y activo** como tarjeta: su línea, su día de
 * corte, su regla de pago y, si hace falta, lo que ya se debía (saldo inicial). Uno por método.
 */
@Injectable()
export class ConfigureCreditCard {
  constructor(
    @Inject(CREDIT_CARD_REPOSITORY) private readonly cards: CreditCardRepository,
    @Inject(CREDIT_CARD_CATALOG_READER) private readonly catalog: CreditCardCatalogReader,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(
    userId: string,
    paymentMethodId: string,
    settings: CreditCardSettings,
  ): Promise<CreditCardView> {
    const method = await this.catalog.paymentMethod(userId, paymentMethodId);
    if (method === null) throw new CreditCardPaymentMethodNotFoundError();
    assertConfigurableMethod(method);
    assertCreditCardSettings(settings, method.currency, today(this.clock));

    const card = await this.cards.create(userId, paymentMethodId, settings);

    return viewOf(card, await this.catalog.allPaymentMethods(userId));
  }
}

/**
 * Corrige la configuración de una tarjeta, también si su método está archivado. Las reglas se
 * comprueban sobre la tarjeta **como quedaría**, contra la moneda que el método tiene hoy.
 *
 * Cambiar el día de corte **recalcula todo**, los ciclos pasados incluidos (2026-09-29): solo se
 * guarda el día actual, y los estados de cuenta se calculan al consultar.
 */
@Injectable()
export class UpdateCreditCard {
  constructor(
    @Inject(CREDIT_CARD_REPOSITORY) private readonly cards: CreditCardRepository,
    @Inject(CREDIT_CARD_CATALOG_READER) private readonly catalog: CreditCardCatalogReader,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(
    userId: string,
    id: string,
    changes: Partial<CreditCardSettings>,
  ): Promise<CreditCardView> {
    const card = await this.cards.find(userId, id);
    if (card === null) throw new CreditCardNotFoundError();
    const method = await this.catalog.paymentMethod(userId, card.paymentMethodId);
    if (method === null) throw new CreditCardNotFoundError();

    const settings: CreditCardSettings = {
      creditLimit: changes.creditLimit ?? card.creditLimit,
      statementDay: changes.statementDay ?? card.statementDay,
      paymentDueRule: changes.paymentDueRule ?? card.paymentDueRule,
      // `null` quita el saldo inicial; sin la clave, se queda el que había.
      openingBalance:
        changes.openingBalance === undefined ? card.openingBalance : changes.openingBalance,
    };
    assertCreditCardSettings(settings, method.currency, today(this.clock));

    const updated = await this.cards.update(userId, id, settings);
    if (updated === null) throw new CreditCardNotFoundError();

    return viewOf(updated, await this.catalog.allPaymentMethods(userId));
  }
}

function withMethods(
  cards: readonly CreditCard[],
  methods: readonly CardPaymentMethod[],
): CreditCardView[] {
  const byId = new Map(methods.map((method) => [method.id, method]));

  // La base garantiza que cada tarjeta tiene su método (clave compuesta): nunca queda una suelta.
  return cards.flatMap((card) => {
    const paymentMethod = byId.get(card.paymentMethodId);

    return paymentMethod === undefined ? [] : [{ card, paymentMethod }];
  });
}

function viewOf(card: CreditCard, methods: readonly CardPaymentMethod[]): CreditCardView {
  const [view] = withMethods([card], methods);
  if (view === undefined) throw new CreditCardNotFoundError();

  return view;
}
