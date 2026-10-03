import type { LocalDate, Money } from '@sol-a-sol/domain';

/** Una meta guardada. Lo que va y lo que falta no se guardan: se calculan al consultar. */
export interface Goal {
  id: string;
  name: string;
  /** En la moneda de la meta, que queda fija al crearla (2026-10-03). */
  target: Money;
  startDate: LocalDate;
  endDate: LocalDate;
  archivedAt: Date | null;
}

export type NewGoal = Omit<Goal, 'id' | 'archivedAt'>;

/** Lo que se puede cambiar: todo menos la moneda. `archivedAt: null` la desarchiva. */
export type GoalChanges = Partial<Omit<Goal, 'id'>>;

/**
 * Las metas, siempre de una cuenta: cada método **exige el `userId`**, que va dentro de la
 * consulta, nunca en una comprobación aparte.
 */
export interface GoalRepository {
  /** En el orden en que se crearon. */
  list(userId: string, options: { includeArchived: boolean }): Promise<Goal[]>;

  /** `null` si no existe **o es de otra cuenta**. */
  find(userId: string, id: string): Promise<Goal | null>;

  /** Lanza `GoalNameTakenError` si otra meta de la cuenta ya tiene ese nombre. */
  create(userId: string, goal: NewGoal): Promise<Goal>;

  /** `null` si no existe o es de otra cuenta. Lanza `GoalNameTakenError` como `create`. */
  update(userId: string, id: string, changes: GoalChanges): Promise<Goal | null>;
}

export const GOAL_REPOSITORY = Symbol('GoalRepository');
