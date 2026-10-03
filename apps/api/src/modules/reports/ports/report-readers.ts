import type { GoalMovement, LocalDate, Money, TransactionType } from '@sol-a-sol/domain';

/**
 * Lo real de un rango de fechas, sin conocer las tablas de `transactions`. Lo cumple
 * `TransactionsLookup`, de su API pública: vigentes, sin transferencias. **Exige el `userId`.**
 */
export interface ReportActualsReader {
  totalsByCategory(
    userId: string,
    from: LocalDate,
    to: LocalDate,
  ): Promise<{ categoryId: string; type: TransactionType; amount: Money }[]>;

  totalsByDay(
    userId: string,
    from: LocalDate,
    to: LocalDate,
  ): Promise<{ date: LocalDate; type: TransactionType; amount: Money }[]>;

  /** Por comercio tal como se escribió; sin comercio, fuera. */
  totalsByMerchant(
    userId: string,
    from: LocalDate,
    to: LocalDate,
  ): Promise<{ merchant: string; type: TransactionType; amount: Money; count: number }[]>;
}

/**
 * Las categorías de la cuenta, archivadas incluidas: para subir lo de una hija a su madre y, en el
 * CSV, nombrarlas. Lo cumple `CatalogLookup`.
 */
export interface ReportCatalogReader {
  allCategories(userId: string): Promise<{ id: string; name: string; parentId: string | null }[]>;
}

/** Las partidas de un mes, sin conocer las tablas de `budgeting`. Lo cumple `BudgetingLookup`. */
export interface ReportBudgetReader {
  lines(
    userId: string,
    year: number,
    month: number,
  ): Promise<{ categoryId: string; type: TransactionType; planned: Money }[]>;
}

/** Una tarjeta en un mes, como la entrega `CreditCardsLookup`. */
export interface ReportCard {
  cardId: string;
  label: { alias: string; institution: string | null; last4: string | null };
  archived: boolean;
  charges: Money[];
  statements: {
    closingDate: LocalDate;
    dueDate: LocalDate;
    balances: { balance: Money; remaining: Money }[];
  }[];
}

/** Las tarjetas en un mes, sin conocer las tablas de `credit-cards`. Lo cumple `CreditCardsLookup`. */
export interface ReportCardsReader {
  monthlyCards(userId: string, from: LocalDate, to: LocalDate): Promise<ReportCard[]>;
}

/** Una meta con sus movimientos que cuentan, como la entrega `GoalsLookup`. */
export interface ReportGoal {
  goalId: string;
  name: string;
  archived: boolean;
  target: Money;
  startDate: LocalDate;
  endDate: LocalDate;
  contributions: GoalMovement[];
}

/** Las metas, sin conocer las tablas de `goals`. Lo cumple `GoalsLookup`. */
export interface ReportGoalsReader {
  goalsWithMovements(userId: string): Promise<ReportGoal[]>;
}

/** Los módulos que el resumen mensual junta, si están encendidos. */
export type SummarySection = 'budgeting' | 'credit-cards' | 'goals';

/**
 * Qué módulos están encendidos, sin leer el entorno desde `application/`. Lo cumple
 * `FeatureFlagsService`. Un módulo apagado no se consulta ni aparece en el resumen.
 */
export interface ReportFeatureFlags {
  isEnabled(module: SummarySection): boolean;
}

export const REPORT_ACTUALS_READER = Symbol('ReportActualsReader');
export const REPORT_BUDGET_READER = Symbol('ReportBudgetReader');
export const REPORT_CARDS_READER = Symbol('ReportCardsReader');
export const REPORT_GOALS_READER = Symbol('ReportGoalsReader');
export const REPORT_FEATURE_FLAGS = Symbol('ReportFeatureFlags');
export const REPORT_CATALOG_READER = Symbol('ReportCatalogReader');
