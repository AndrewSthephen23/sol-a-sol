import { Module } from '@nestjs/common';

import { PrismaModule } from '../../shared/prisma/prisma.module.js';
import { IdentityModule } from '../identity/index.js';
import { TransactionsLookup, TransactionsModule } from '../transactions/index.js';
import {
  AddGoalContribution,
  DeleteGoalContribution,
  ListGoalContributions,
} from './application/goal-contributions.js';
import { CreateGoal, ListGoals, UpdateGoal } from './application/goals.js';
import { GoalContributionsController } from './http/goal-contributions.controller.js';
import { GoalsController } from './http/goals.controller.js';
import { PrismaGoalContributionRepository } from './infrastructure/prisma-goal-contribution-repository.js';
import { PrismaGoalRepository } from './infrastructure/prisma-goal-repository.js';
import { GOAL_CONTRIBUTION_REPOSITORY } from './ports/goal-contribution-repository.js';
import { GOAL_REPOSITORY } from './ports/goal-repository.js';
import { GOAL_TRANSACTIONS_READER } from './ports/transactions-reader.js';

/**
 * Módulo goals. Entra a main detrás de FEATURE_GOALS: sus rutas llevan
 * `@RequiresFeature('goals')` y responden 404 mientras el flag esté apagado.
 *
 * Importa solo la API pública de otros módulos: de `identity`, el guard que resuelve quién pide;
 * de `transactions`, `TransactionsLookup`, que cumple el puerto `GoalTransactionsReader` (las
 * transacciones que siguen los aportes enlazados).
 */
@Module({
  imports: [PrismaModule, IdentityModule, TransactionsModule],
  controllers: [GoalsController, GoalContributionsController],
  providers: [
    ListGoals,
    CreateGoal,
    UpdateGoal,
    ListGoalContributions,
    AddGoalContribution,
    DeleteGoalContribution,
    { provide: GOAL_REPOSITORY, useClass: PrismaGoalRepository },
    { provide: GOAL_CONTRIBUTION_REPOSITORY, useClass: PrismaGoalContributionRepository },
    { provide: GOAL_TRANSACTIONS_READER, useExisting: TransactionsLookup },
  ],
  exports: [],
})
export class GoalsModule {}
