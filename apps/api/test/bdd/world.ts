import 'reflect-metadata';

import { setWorldConstructor, World } from '@cucumber/cucumber';
import { type Clock, type Currency, FixedClock, type TransactionType } from '@sol-a-sol/domain';

import { RecordingEventPublisher } from '../../src/shared/events/event-publisher.fake.js';
import {
  CreateTransaction,
  type CreateTransactionInput,
  DeleteTransaction,
  GetTransaction,
  ListTransactions,
  type ListTransactionsInput,
  RestoreTransaction,
  type TransactionPage,
  UpdateTransaction,
} from '../../src/modules/transactions/application/transactions.js';
import { FakeCatalogReader } from '../../src/modules/transactions/ports/catalog-reader.fake.js';
import type { Transaction } from '../../src/modules/transactions/ports/transaction-repository.js';
import { FakeTransactionRepository } from '../../src/modules/transactions/ports/transaction-repository.fake.js';
import { FakeTransferRepository } from '../../src/modules/transactions/ports/transfer-repository.fake.js';

export const ANA = 'user-ana';
export const BRUNO = 'user-bruno';

/** Las 21:30 del 24/09/2026 en Lima: en UTC ya es el 25. El "hoy" por defecto de los escenarios. */
const DEFAULT_NOW = '2026-09-25T02:30:00.000Z';

/** Lo que una cuenta tiene al empezar cada escenario, además de lo que el escenario agrega. */
const STANDARD_CATEGORIES: readonly [string, TransactionType][] = [
  ['Comida', 'VARIABLE_EXPENSE'],
  ['Alquiler', 'FIXED_EXPENSE'],
  ['Sueldo', 'INCOME'],
  ['Ahorro', 'SAVING'],
  ['Inversiones', 'INVESTMENT'],
  ['Préstamo', 'DEBT'],
];
const STANDARD_METHODS: readonly [string, Currency | null][] = [
  ['Sueldo BCP', 'PEN'],
  ['Ahorros USD', 'USD'],
];

/**
 * El estado de un escenario: una cuenta (Ana) con su catálogo, los casos de uso reales sobre los
 * fakes de sus puertos y un reloj fijo. Se arma de cero en cada escenario: ninguno depende de
 * otro.
 */
export class TransactionsWorld extends World {
  readonly catalog = new FakeCatalogReader();
  readonly transactions = new FakeTransactionRepository();
  readonly transfers = new FakeTransferRepository();
  readonly events = new RecordingEventPublisher();
  clock: Clock = FixedClock.at(DEFAULT_NOW);

  /** Nombre → id, por cuenta: los escenarios hablan de «Comida», no de ids. */
  private readonly categoryIds = new Map<string, string>();
  private readonly methodIds = new Map<string, string>();

  /** Lo último que pasó, para los «Entonces». */
  last: Transaction | null = null;
  lastError: unknown = null;
  page: TransactionPage | null = null;
  /** Transacciones de las que el escenario habla después («la del 10/09», «uno de la primera página»). */
  readonly remembered = new Map<string, Transaction>();
  /** Ids de los que el escenario habla después («esa cuenta», «la categoría de Bruno»). */
  readonly ids = new Map<string, string>();

  constructor(options: ConstructorParameters<typeof World>[0]) {
    super(options);
    for (const [name, type] of STANDARD_CATEGORIES) this.addCategory(ANA, name, type);
    for (const [alias, currency] of STANDARD_METHODS) this.addPaymentMethod(ANA, alias, currency);
  }

  addCategory(
    userId: string,
    name: string,
    type: TransactionType,
    options: { parent?: string; archived?: boolean } = {},
  ): string {
    const id = `${userId}/category/${name}`;
    this.categoryIds.set(`${userId}/${name}`, id);
    this.catalog.withCategory(userId, id, {
      type,
      name,
      archived: options.archived ?? false,
      ...(options.parent === undefined
        ? {}
        : { parentId: this.categoryId(userId, options.parent) }),
    });

    return id;
  }

  /** Archivar después de usarla: el fake se sobrescribe con el mismo id. */
  archiveCategory(userId: string, name: string, type: TransactionType): void {
    this.addCategory(userId, name, type, { archived: true });
  }

  addPaymentMethod(
    userId: string,
    alias: string,
    currency: Currency | null,
    archived = false,
  ): string {
    const id = `${userId}/method/${alias}`;
    this.methodIds.set(`${userId}/${alias}`, id);
    this.catalog.withPaymentMethod(userId, id, { currency, alias, archived });

    return id;
  }

  categoryId(userId: string, name: string): string {
    const id = this.categoryIds.get(`${userId}/${name}`);
    if (id === undefined) throw new Error(`The scenario never set up the category «${name}».`);

    return id;
  }

  methodId(userId: string, alias: string): string {
    const id = this.methodIds.get(`${userId}/${alias}`);
    if (id === undefined)
      throw new Error(`The scenario never set up the payment method «${alias}».`);

    return id;
  }

  // Los casos de uso se crean al usarlos: así ven el reloj que el escenario haya fijado.

  create(
    input: Partial<CreateTransactionInput> & Pick<CreateTransactionInput, 'amount'>,
  ): Promise<Transaction> {
    const useCase = new CreateTransaction(this.transactions, this.catalog, this.events, this.clock);

    return useCase.execute({
      userId: ANA,
      date: '2026-09-20',
      type: 'VARIABLE_EXPENSE',
      currency: 'PEN',
      description: 'Gasto',
      source: 'MANUAL',
      ...input,
      // La de la cuenta que registra, salvo que el paso diga otra.
      categoryId: input.categoryId ?? this.categoryId(input.userId ?? ANA, 'Comida'),
    });
  }

  get getTransaction(): GetTransaction {
    return new GetTransaction(this.transactions);
  }

  get updateTransaction(): UpdateTransaction {
    return new UpdateTransaction(this.transactions, this.catalog, this.events, this.clock);
  }

  get deleteTransaction(): DeleteTransaction {
    return new DeleteTransaction(this.transactions, this.events, this.clock);
  }

  get restoreTransaction(): RestoreTransaction {
    return new RestoreTransaction(this.transactions, this.events);
  }

  list(input: Partial<ListTransactionsInput> = {}): Promise<TransactionPage> {
    const useCase = new ListTransactions(this.transactions, this.transfers, this.catalog);

    return useCase.execute({ userId: ANA, after: null, limit: 50, ...input });
  }

  /** Registra y guarda lo registrado como `last`; si se rechaza, guarda el error. */
  async attempt(run: () => Promise<Transaction>): Promise<void> {
    this.lastError = null;
    try {
      this.last = await run();
    } catch (error) {
      this.lastError = error;
    }
  }
}

setWorldConstructor(TransactionsWorld);
