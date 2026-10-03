// API pública del módulo goals.
// Otros módulos solo pueden importar desde aquí, nunca de sus carpetas internas.
export { GoalsModule } from './goals.module.js';
export { type GoalWithMovements, GoalsLookup } from './application/goals-lookup.js';
