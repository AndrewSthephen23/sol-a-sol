/**
 * Un plan de cuotas guardado: solo lo que la compra no tiene. El monto, la fecha y la moneda se
 * leen de la compra al consultar.
 */
export interface StoredInstallmentPlan {
  id: string;
  creditCardId: string;
  transactionId: string;
  count: number;
  /** Con intereses, el total del banco (string decimal, en la moneda de la compra); si no, `null`. */
  totalAmount: string | null;
}

export type NewInstallmentPlan = Omit<StoredInstallmentPlan, 'id'>;

/**
 * Los planes de cuotas, siempre de una cuenta: cada método **exige el `userId`**, que va dentro de
 * la consulta, nunca en una comprobación aparte.
 */
export interface InstallmentPlanRepository {
  /** Los de una tarjeta, en el orden en que se registraron. */
  listByCard(userId: string, creditCardId: string): Promise<StoredInstallmentPlan[]>;

  /** Lanza `InstallmentPlanAlreadyExistsError` si la compra ya tiene su plan. */
  create(userId: string, plan: NewInstallmentPlan): Promise<StoredInstallmentPlan>;

  /** `false` si no existe, es de otra tarjeta o de otra cuenta. */
  delete(userId: string, creditCardId: string, id: string): Promise<boolean>;
}

export const INSTALLMENT_PLAN_REPOSITORY = Symbol('InstallmentPlanRepository');
