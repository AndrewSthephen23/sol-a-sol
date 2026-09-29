import 'reflect-metadata';

import { setWorldConstructor, World } from '@cucumber/cucumber';
import { type Clock, type Currency, FixedClock, type TransactionType } from '@sol-a-sol/domain';

import { RecordingEventPublisher } from '../../src/shared/events/event-publisher.fake.js';
import {
  type Budget,
  GetBudget,
  ReplaceBudget,
} from '../../src/modules/budgeting/application/budgets.js';
import {
  type CopiedBudget,
  CopyPreviousBudget,
} from '../../src/modules/budgeting/application/copy-previous-budget.js';
import { ReassignBudgetCategory } from '../../src/modules/budgeting/application/reassign-budget-category.js';
import { BudgetCategoryMergedListener } from '../../src/modules/budgeting/infrastructure/category-merged.listener.js';
import { FakeBudgetRepository } from '../../src/modules/budgeting/ports/budget-repository.fake.js';
import { FakeBudgetCatalogReader } from '../../src/modules/budgeting/ports/catalog-reader.fake.js';
import {
  GetMonthlyDashboard,
  type MonthlyDashboard,
} from '../../src/modules/reports/application/monthly-dashboard.js';
import { FakeReportCatalogReader } from '../../src/modules/reports/ports/report-readers.fake.js';
import { TransactionsLookup } from '../../src/modules/transactions/application/transactions-lookup.js';
import { CreateTransfer } from '../../src/modules/transactions/application/transfers.js';
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
 *
 * Cucumber admite un solo mundo, así que este sirve a todos los `.feature`. El presupuesto y los
 * reportes leen lo real con `TransactionsLookup` sobre el mismo repositorio de transacciones, como
 * en la aplicación: lo que un escenario registra es lo que ven.
 */
export class TransactionsWorld extends World {
  readonly catalog = new FakeCatalogReader();
  readonly transactions = new FakeTransactionRepository();
  readonly transfers = new FakeTransferRepository();
  readonly events = new RecordingEventPublisher();
  readonly budgetLines = new FakeBudgetRepository();
  readonly budgetCatalog = new FakeBudgetCatalogReader();
  readonly reportCatalog = new FakeReportCatalogReader();
  clock: Clock = FixedClock.at(DEFAULT_NOW);

  /** El tipo de cada categoría, para registrar un movimiento del tipo que le corresponde. */
  private readonly categoryTypes = new Map<string, TransactionType>();

  /** Nombre → id, por cuenta: los escenarios hablan de «Comida», no de ids. */
  private readonly categoryIds = new Map<string, string>();
  private readonly methodIds = new Map<string, string>();

  /** Lo último que pasó, para los «Entonces». */
  last: Transaction | null = null;
  lastError: unknown = null;
  page: TransactionPage | null = null;
  /** El presupuesto o el resumen que el escenario acaba de ver. */
  budget: Budget | null = null;
  copied: CopiedBudget | null = null;
  dashboard: MonthlyDashboard | null = null;
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
    this.categoryTypes.set(id, type);
    const parentId =
      options.parent === undefined ? undefined : this.categoryId(userId, options.parent);
    const category = {
      type,
      archived: options.archived ?? false,
      ...(parentId === undefined ? {} : { parentId }),
    };
    // El mismo catálogo, visto por cada módulo a través de su propio puerto.
    this.catalog.withCategory(userId, id, { ...category, name });
    this.budgetCatalog.withCategory(userId, id, category);
    this.reportCatalog.with(userId, id, parentId ?? null);

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

  /** La categoría si ya existe; si no, una nueva de ese tipo. */
  ensureCategory(userId: string, name: string, type: TransactionType): string {
    return this.categoryIds.get(`${userId}/${name}`) ?? this.addCategory(userId, name, type);
  }

  categoryType(id: string): TransactionType {
    const type = this.categoryTypes.get(id);
    if (type === undefined) throw new Error(`The scenario never set up the category «${id}».`);

    return type;
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

  get createTransfer(): CreateTransfer {
    return new CreateTransfer(this.transfers, this.catalog, this.events, this.clock);
  }

  // --- Presupuesto y reportes: leen lo real por la API pública de `transactions` ---

  get getBudget(): GetBudget {
    return new GetBudget(
      this.budgetLines,
      this.budgetCatalog,
      new TransactionsLookup(this.transactions),
    );
  }

  get replaceBudget(): ReplaceBudget {
    return new ReplaceBudget(this.budgetLines, this.budgetCatalog, this.getBudget);
  }

  get copyBudget(): CopyPreviousBudget {
    return new CopyPreviousBudget(this.budgetLines, this.budgetCatalog, this.getBudget);
  }

  /** Lo que escucha el presupuesto cuando `catalog` fusiona una categoría. */
  get budgetMergeListener(): BudgetCategoryMergedListener {
    return new BudgetCategoryMergedListener(new ReassignBudgetCategory(this.budgetLines));
  }

  get monthlyDashboard(): GetMonthlyDashboard {
    const lookup = new TransactionsLookup(this.transactions);

    return new GetMonthlyDashboard(lookup, this.reportCatalog, this.clock);
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
