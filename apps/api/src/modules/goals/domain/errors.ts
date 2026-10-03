import { DomainError } from '@sol-a-sol/domain';

/** La meta no existe o es de otra cuenta: para quien llama es lo mismo (404). */
export class GoalNotFoundError extends DomainError {
  readonly code = 'GOAL_NOT_FOUND';

  constructor() {
    super('Savings goal not found.');
  }
}

/**
 * El nombre ya lo usa otra meta de la cuenta, sin distinguir mayúsculas y contando las archivadas
 * (2026-10-03): está bien escrito, pero choca con lo que existe (409).
 */
export class GoalNameTakenError extends DomainError {
  readonly code = 'GOAL_NAME_TAKEN';

  constructor() {
    super('Another savings goal already has that name (maybe an archived one).');
  }
}

/** Una meta archivada no recibe aportes nuevos (2026-10-03): se desarchiva primero (422). */
export class GoalArchivedError extends DomainError {
  readonly code = 'GOAL_ARCHIVED';

  constructor() {
    super('The savings goal is archived: restore it to add contributions.');
  }
}

/** El aporte no existe, es de otra meta o de otra cuenta (404). */
export class GoalContributionNotFoundError extends DomainError {
  readonly code = 'GOAL_CONTRIBUTION_NOT_FOUND';

  constructor() {
    super('Goal contribution not found.');
  }
}

/** Una transacción aporta a una sola meta (2026-10-03): la segunda vez choca (409). */
export class GoalTransactionAlreadyLinkedError extends DomainError {
  readonly code = 'GOAL_TRANSACTION_ALREADY_LINKED';

  constructor() {
    super('The transaction already feeds a savings goal: undo that contribution first.');
  }
}

/**
 * La transacción no existe, está borrada o es de otra cuenta. Mismo código que en `transactions`:
 * para quien llama es el mismo error (404).
 */
export class GoalTransactionNotFoundError extends DomainError {
  readonly code = 'TRANSACTION_NOT_FOUND';

  constructor() {
    super('Transaction not found.');
  }
}
