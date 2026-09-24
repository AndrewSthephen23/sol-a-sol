import { Inject, Injectable } from '@nestjs/common';
import {
  assertValidPaymentMethod,
  type Clock,
  type Currency,
  type PaymentMethodKind,
} from '@sol-a-sol/domain';

import { CLOCK } from '../../../shared/time/system-clock.js';
import { PaymentMethodNotFoundError } from '../domain/errors.js';
import {
  PAYMENT_METHOD_REPOSITORY,
  type PaymentMethod,
  type PaymentMethodChanges,
  type PaymentMethodRepository,
} from '../ports/payment-method-repository.js';

export interface CreatePaymentMethodInput {
  userId: string;
  kind: PaymentMethodKind;
  alias: string;
  institution?: string | null;
  last4?: string | null;
  currency?: Currency | null;
}

@Injectable()
export class CreatePaymentMethod {
  constructor(
    @Inject(PAYMENT_METHOD_REPOSITORY) private readonly methods: PaymentMethodRepository,
  ) {}

  async execute(input: CreatePaymentMethodInput): Promise<PaymentMethod> {
    const method = {
      userId: input.userId,
      kind: input.kind,
      alias: input.alias,
      institution: input.institution ?? null,
      last4: input.last4 ?? null,
      currency: input.currency ?? null,
    };
    assertValidPaymentMethod(method);

    return this.methods.create(method);
  }
}

@Injectable()
export class ListPaymentMethods {
  constructor(
    @Inject(PAYMENT_METHOD_REPOSITORY) private readonly methods: PaymentMethodRepository,
  ) {}

  async execute(input: { userId: string; includeArchived: boolean }): Promise<PaymentMethod[]> {
    return this.methods.list(input.userId, { includeArchived: input.includeArchived });
  }
}

export interface UpdatePaymentMethodInput {
  userId: string;
  id: string;
  changes: Omit<PaymentMethodChanges, 'archivedAt'> & { archived?: boolean };
}

@Injectable()
export class UpdatePaymentMethod {
  constructor(
    @Inject(PAYMENT_METHOD_REPOSITORY) private readonly methods: PaymentMethodRepository,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute({ userId, id, changes }: UpdatePaymentMethodInput): Promise<PaymentMethod> {
    const current = await this.methods.find(userId, id);
    if (current === null) throw new PaymentMethodNotFoundError();

    const { archived, ...fields } = changes;
    // Las reglas se aplican al método **como quedaría**, no solo a lo que cambia: quitarle los
    // últimos 4 a una tarjeta rompe una regla aunque el cambio en sí sea un `null` inocente.
    assertValidPaymentMethod({ ...current, ...fields });

    const updated = await this.methods.update(userId, id, {
      ...fields,
      ...(archived === undefined ? {} : { archivedAt: this.archivedAt(current, archived) }),
    });
    // Entre la lectura y la escritura pudo desaparecer: para quien llama, simplemente no existe.
    if (updated === null) throw new PaymentMethodNotFoundError();

    return updated;
  }

  /** Archivar lo ya archivado conserva la fecha original: sigue diciendo cuándo pasó de verdad. */
  private archivedAt(current: PaymentMethod, archived: boolean): Date | null {
    if (!archived) return null;

    return current.archivedAt ?? this.clock.now();
  }
}
