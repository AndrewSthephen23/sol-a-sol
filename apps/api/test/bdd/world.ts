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
import { FakeBudgetRepository } from '../../src/modules/budgeting/ports/budget-repository.fake.js';
import { FakeBudgetCatalogReader } from '../../src/modules/budgeting/ports/catalog-reader.fake.js';
import {
  GetMonthlyDashboard,
  type MonthlyDashboard,
} from '../../src/modules/reports/application/monthly-dashboard.js';
import { GetAnnualSummary } from '../../src/modules/reports/application/annual-summary.js';
import {
  GetMonthlySummary,
  type MonthlySummaryView,
} from '../../src/modules/reports/application/monthly-summary.js';
import {
  FakeReportCatalogReader,
  FakeReportFeatureFlags,
} from '../../src/modules/reports/ports/report-readers.fake.js';
import { BudgetingLookup } from '../../src/modules/budgeting/application/budgeting-lookup.js';
import { CreditCardsLookup } from '../../src/modules/credit-cards/application/credit-cards-lookup.js';
import {
  AddGoalContribution,
  DeleteGoalContribution,
  ListGoalContributions,
} from '../../src/modules/goals/application/goal-contributions.js';
import { CaptureLookup } from '../../src/modules/capture/application/capture-lookup.js';
import { FakeCaptureRepository } from '../../src/modules/capture/ports/capture-repository.fake.js';
import type { GoalView } from '../../src/modules/goals/application/goal-views.js';
import { CreateGoal, ListGoals, UpdateGoal } from '../../src/modules/goals/application/goals.js';
import { GoalsLookup } from '../../src/modules/goals/application/goals-lookup.js';
import { FakeGoalContributionRepository } from '../../src/modules/goals/ports/goal-contribution-repository.fake.js';
import { FakeGoalRepository } from '../../src/modules/goals/ports/goal-repository.fake.js';
import type { AnnualSummary } from '@sol-a-sol/domain';
import {
  type CreditCardStatusView,
  GetCreditCardStatuses,
} from '../../src/modules/credit-cards/application/credit-card-status.js';
import {
  ConfigureCreditCard,
  ListCreditCards,
  UpdateCreditCard,
} from '../../src/modules/credit-cards/application/credit-cards.js';
import {
  CreateInstallmentPlan,
  type InstallmentPlanView,
} from '../../src/modules/credit-cards/application/installment-plans.js';
import { FakeCreditCardCatalogReader } from '../../src/modules/credit-cards/ports/catalog-reader.fake.js';
import { FakeCreditCardRepository } from '../../src/modules/credit-cards/ports/credit-card-repository.fake.js';
import { FakeInstallmentPlanRepository } from '../../src/modules/credit-cards/ports/installment-plan-repository.fake.js';
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
  readonly creditCards = new FakeCreditCardRepository();
  readonly installmentPlans = new FakeInstallmentPlanRepository();
  /** Los métodos de pago vistos por `credit-cards`, con su tipo: el mismo id que en `catalog`. */
  readonly cardCatalog = new FakeCreditCardCatalogReader();
  readonly goals = new FakeGoalRepository();
  readonly captures = new FakeCaptureRepository();
  readonly goalContributions = new FakeGoalContributionRepository();
  /** Qué módulos ve encendidos el resumen mensual: todos, salvo que el escenario apague uno. */
  readonly reportFlags = new FakeReportFeatureFlags();
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
  /** La tarjeta que el escenario acaba de ver, y el plan de cuotas que acaba de registrar. */
  cardStatus: CreditCardStatusView | null = null;
  installmentPlan: InstallmentPlanView | null = null;
  /** La meta, el cierre del mes o el año que el escenario acaba de ver. */
  goal: GoalView | null = null;
  goalList: GoalView[] = [];
  monthlySummary: MonthlySummaryView | null = null;
  annualSummary: AnnualSummary | null = null;
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
    this.reportCatalog.with(userId, id, parentId ?? null, name);

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

  /** Una tarjeta de crédito bimoneda, sin configurar todavía. Devuelve el id de su método de pago. */
  addCreditCard(userId: string, alias: string): string {
    const id = this.addPaymentMethod(userId, alias, null);
    this.cardCatalog.withMethod(userId, id, { kind: 'CREDIT_CARD', currency: null });

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
      new TransactionsLookup(this.transactions, this.transfers),
    );
  }

  get replaceBudget(): ReplaceBudget {
    return new ReplaceBudget(this.budgetLines, this.budgetCatalog, this.getBudget);
  }

  get copyBudget(): CopyPreviousBudget {
    return new CopyPreviousBudget(this.budgetLines, this.budgetCatalog, this.getBudget);
  }

  /**
   * Lo que hace el presupuesto cuando `catalog` fusiona una categoría. Sin su listener: ese importa
   * la API pública de `catalog`, que arrastra Prisma, y los escenarios corren sin base.
   */
  get reassignBudgetCategory(): ReassignBudgetCategory {
    return new ReassignBudgetCategory(this.budgetLines);
  }

  get monthlyDashboard(): GetMonthlyDashboard {
    const lookup = new TransactionsLookup(this.transactions, this.transfers);

    return new GetMonthlyDashboard(lookup, this.reportCatalog, this.clock);
  }

  // --- Tarjetas: leen lo que se compró y se pagó por la API pública de `transactions` ---

  get transactionsLookup(): TransactionsLookup {
    return new TransactionsLookup(this.transactions, this.transfers);
  }

  get configureCreditCard(): ConfigureCreditCard {
    return new ConfigureCreditCard(this.creditCards, this.cardCatalog, this.clock);
  }

  get updateCreditCard(): UpdateCreditCard {
    return new UpdateCreditCard(this.creditCards, this.cardCatalog, this.clock);
  }

  get creditCardStatuses(): GetCreditCardStatuses {
    return new GetCreditCardStatuses(
      new ListCreditCards(this.creditCards, this.cardCatalog),
      this.transactionsLookup,
      this.installmentPlans,
      this.clock,
    );
  }

  get createInstallmentPlan(): CreateInstallmentPlan {
    return new CreateInstallmentPlan(
      this.creditCards,
      this.installmentPlans,
      this.transactionsLookup,
      this.clock,
    );
  }

  // --- Metas: leen las transacciones enlazadas por la API pública de `transactions` ---

  get createGoal(): CreateGoal {
    return new CreateGoal(this.goals, this.transactionsLookup, this.clock);
  }

  get updateGoal(): UpdateGoal {
    return new UpdateGoal(this.goals, this.goalContributions, this.transactionsLookup, this.clock);
  }

  get listGoals(): ListGoals {
    return new ListGoals(this.goals, this.goalContributions, this.transactionsLookup, this.clock);
  }

  get addGoalContribution(): AddGoalContribution {
    return new AddGoalContribution(
      this.goals,
      this.goalContributions,
      this.transactionsLookup,
      this.clock,
    );
  }

  get deleteGoalContribution(): DeleteGoalContribution {
    return new DeleteGoalContribution(
      this.goals,
      this.goalContributions,
      this.transactionsLookup,
      this.clock,
    );
  }

  get listGoalContributions(): ListGoalContributions {
    return new ListGoalContributions(
      this.goals,
      this.goalContributions,
      this.transactionsLookup,
      this.clock,
    );
  }

  // --- Resúmenes: cada módulo, por su `…Lookup` público, sobre los mismos fakes ---

  get monthlySummaryUseCase(): GetMonthlySummary {
    return new GetMonthlySummary(
      this.transactionsLookup,
      this.reportCatalog,
      new BudgetingLookup(this.budgetLines),
      new CreditCardsLookup(
        new ListCreditCards(this.creditCards, this.cardCatalog),
        this.transactionsLookup,
        this.installmentPlans,
      ),
      new GoalsLookup(this.goals, this.goalContributions, this.transactionsLookup, this.clock),
      new CaptureLookup(this.captures),
      this.reportFlags,
      this.clock,
    );
  }

  get annualSummaryUseCase(): GetAnnualSummary {
    return new GetAnnualSummary(this.transactionsLookup, this.reportCatalog, this.clock);
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
