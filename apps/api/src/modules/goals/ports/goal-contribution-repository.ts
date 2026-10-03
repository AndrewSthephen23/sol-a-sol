import type { GoalContributionKind, LocalDate } from '@sol-a-sol/domain';

/** Un aporte o un retiro manual: con su fecha y su monto (string decimal, en la moneda de la meta). */
export interface StoredManualContribution {
  id: string;
  goalId: string;
  source: 'MANUAL';
  kind: GoalContributionKind;
  amount: string;
  date: LocalDate;
}

/**
 * Un aporte enlazado: solo la transacción. El monto y la fecha se leen de ella al consultar, así
 * que la sigue si se corrige o se borra (2026-10-03).
 */
export interface StoredLinkedContribution {
  id: string;
  goalId: string;
  source: 'TRANSACTION';
  transactionId: string;
}

export type StoredGoalContribution = StoredManualContribution | StoredLinkedContribution;

export type NewGoalContribution =
  Omit<StoredManualContribution, 'id'> | Omit<StoredLinkedContribution, 'id'>;

/**
 * Los aportes, siempre de una cuenta: cada método **exige el `userId`**, que va dentro de la
 * consulta, nunca en una comprobación aparte.
 */
export interface GoalContributionRepository {
  /** Los de esas metas, en el orden en que se registraron. */
  listByGoals(userId: string, goalIds: readonly string[]): Promise<StoredGoalContribution[]>;

  /** Lanza `GoalTransactionAlreadyLinkedError` si la transacción ya aporta a una meta. */
  create(userId: string, contribution: NewGoalContribution): Promise<StoredGoalContribution>;

  /** `false` si no existe, es de otra meta o de otra cuenta. */
  delete(userId: string, goalId: string, id: string): Promise<boolean>;
}

export const GOAL_CONTRIBUTION_REPOSITORY = Symbol('GoalContributionRepository');
