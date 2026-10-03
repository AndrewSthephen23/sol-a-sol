import { GoalTransactionAlreadyLinkedError } from '../domain/errors.js';
import type {
  GoalContributionRepository,
  NewGoalContribution,
  StoredGoalContribution,
} from './goal-contribution-repository.js';

/** Aportes en memoria, con la misma transacción única que la base. */
export class FakeGoalContributionRepository implements GoalContributionRepository {
  private readonly contributions: { userId: string; contribution: StoredGoalContribution }[] = [];
  private nextId = 1;

  listByGoals(userId: string, goalIds: readonly string[]): Promise<StoredGoalContribution[]> {
    return Promise.resolve(
      this.contributions
        .filter((entry) => entry.userId === userId && goalIds.includes(entry.contribution.goalId))
        .map((entry) => ({ ...entry.contribution })),
    );
  }

  create(userId: string, contribution: NewGoalContribution): Promise<StoredGoalContribution> {
    if (
      contribution.source === 'TRANSACTION' &&
      this.contributions.some(
        (entry) =>
          entry.contribution.source === 'TRANSACTION' &&
          entry.contribution.transactionId === contribution.transactionId,
      )
    ) {
      return Promise.reject(new GoalTransactionAlreadyLinkedError());
    }
    const created = { ...contribution, id: `contribution-${String(this.nextId++)}` };
    this.contributions.push({ userId, contribution: created });

    return Promise.resolve({ ...created });
  }

  delete(userId: string, goalId: string, id: string): Promise<boolean> {
    const index = this.contributions.findIndex(
      (entry) =>
        entry.userId === userId &&
        entry.contribution.goalId === goalId &&
        entry.contribution.id === id,
    );
    if (index === -1) return Promise.resolve(false);
    this.contributions.splice(index, 1);

    return Promise.resolve(true);
  }
}
