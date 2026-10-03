import { GoalNameTakenError } from '../domain/errors.js';
import type { Goal, GoalChanges, GoalRepository, NewGoal } from './goal-repository.js';

/** Metas en memoria, con el mismo nombre único por cuenta (sin mayúsculas) que la base. */
export class FakeGoalRepository implements GoalRepository {
  private readonly goals: { userId: string; goal: Goal }[] = [];
  private nextId = 1;

  list(userId: string, options: { includeArchived: boolean }): Promise<Goal[]> {
    return Promise.resolve(
      this.goals
        .filter(
          (entry) =>
            entry.userId === userId && (options.includeArchived || entry.goal.archivedAt === null),
        )
        .map((entry) => ({ ...entry.goal })),
    );
  }

  find(userId: string, id: string): Promise<Goal | null> {
    const found = this.goals.find((entry) => entry.goal.id === id && entry.userId === userId);

    return Promise.resolve(found === undefined ? null : { ...found.goal });
  }

  create(userId: string, goal: NewGoal): Promise<Goal> {
    if (this.nameTaken(userId, goal.name, null)) return Promise.reject(new GoalNameTakenError());
    const created = { ...goal, id: `goal-${String(this.nextId++)}`, archivedAt: null };
    this.goals.push({ userId, goal: created });

    return Promise.resolve({ ...created });
  }

  update(userId: string, id: string, changes: GoalChanges): Promise<Goal | null> {
    const found = this.goals.find((entry) => entry.goal.id === id && entry.userId === userId);
    if (found === undefined) return Promise.resolve(null);
    if (changes.name !== undefined && this.nameTaken(userId, changes.name, id)) {
      return Promise.reject(new GoalNameTakenError());
    }
    found.goal = { ...found.goal, ...changes };

    return this.find(userId, id);
  }

  private nameTaken(userId: string, name: string, exceptId: string | null): boolean {
    return this.goals.some(
      (entry) =>
        entry.userId === userId &&
        entry.goal.id !== exceptId &&
        entry.goal.name.toLowerCase() === name.toLowerCase(),
    );
  }
}
