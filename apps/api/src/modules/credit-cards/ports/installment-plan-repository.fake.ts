import { InstallmentPlanAlreadyExistsError } from '../domain/errors.js';
import type {
  InstallmentPlanRepository,
  NewInstallmentPlan,
  StoredInstallmentPlan,
} from './installment-plan-repository.js';

/** Planes en memoria, con el mismo único por compra que la base. */
export class FakeInstallmentPlanRepository implements InstallmentPlanRepository {
  private readonly plans: { userId: string; plan: StoredInstallmentPlan }[] = [];
  private nextId = 1;

  listByCard(userId: string, creditCardId: string): Promise<StoredInstallmentPlan[]> {
    return Promise.resolve(
      this.plans
        .filter((entry) => entry.userId === userId && entry.plan.creditCardId === creditCardId)
        .map((entry) => ({ ...entry.plan })),
    );
  }

  create(userId: string, plan: NewInstallmentPlan): Promise<StoredInstallmentPlan> {
    if (this.plans.some((entry) => entry.plan.transactionId === plan.transactionId)) {
      return Promise.reject(new InstallmentPlanAlreadyExistsError());
    }
    const stored = { ...plan, id: `plan-${String(this.nextId++)}` };
    this.plans.push({ userId, plan: stored });

    return Promise.resolve({ ...stored });
  }

  delete(userId: string, creditCardId: string, id: string): Promise<boolean> {
    const index = this.plans.findIndex(
      (entry) =>
        entry.userId === userId && entry.plan.creditCardId === creditCardId && entry.plan.id === id,
    );
    if (index === -1) return Promise.resolve(false);
    this.plans.splice(index, 1);

    return Promise.resolve(true);
  }
}
