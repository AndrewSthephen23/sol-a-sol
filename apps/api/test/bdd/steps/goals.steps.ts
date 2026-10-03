import assert from 'node:assert/strict';

import { Given, Then, When } from '@cucumber/cucumber';
import { formatPercentage, type GoalStatus, LocalDate, Money } from '@sol-a-sol/domain';

import type { GoalContributionInput } from '../../../src/modules/goals/application/goal-contributions.js';
import type { GoalView } from '../../../src/modules/goals/application/goal-views.js';
import type { Transaction } from '../../../src/modules/transactions/ports/transaction-repository.js';
import { amountOf, describe, sameMoney } from '../support/readers.js';
import { ANA, BRUNO, type TransactionsWorld } from '../world.js';

// --- Las metas ------------------------------------------------------------------------------------

function goalKey(userId: string, name: string): string {
  return `goal ${userId}/${name}`;
}

function goalId(world: TransactionsWorld, name: string, userId = ANA): string {
  const id = world.ids.get(goalKey(userId, name));
  if (id === undefined) throw new Error(`The scenario never set up the goal «${name}».`);

  return id;
}

async function createGoal(
  world: TransactionsWorld,
  userId: string,
  name: string,
  target: string,
  start: string,
  end: string,
): Promise<void> {
  const { amount, currency } = amountOf(target);
  const view = await world.createGoal.execute(userId, {
    name,
    target: Money.of(amount, currency),
    startDate: LocalDate.parse(start),
    endDate: LocalDate.parse(end),
  });
  world.ids.set(goalKey(userId, name), view.goal.id);
}

Given(
  'que tengo la meta {string} de {string} del {fecha} al {fecha}',
  async function (
    this: TransactionsWorld,
    name: string,
    target: string,
    start: string,
    end: string,
  ) {
    await createGoal(this, ANA, name, target, start, end);
  },
);

Given(
  'que Bruno tiene la meta {string} de {string} del {fecha} al {fecha}',
  async function (
    this: TransactionsWorld,
    name: string,
    target: string,
    start: string,
    end: string,
  ) {
    await createGoal(this, BRUNO, name, target, start, end);
  },
);

When(
  'intento crear la meta {string} de {string} del {fecha} al {fecha}',
  async function (
    this: TransactionsWorld,
    name: string,
    target: string,
    start: string,
    end: string,
  ) {
    this.lastError = null;
    try {
      await createGoal(this, ANA, name, target, start, end);
    } catch (error) {
      this.lastError = error;
    }
  },
);

Given('que archivé la meta {string}', async function (this: TransactionsWorld, name: string) {
  await this.updateGoal.execute(ANA, goalId(this, name), { archived: true });
});

// --- Aportes y retiros ----------------------------------------------------------------------------

function manual(
  kind: 'CONTRIBUTION' | 'WITHDRAWAL',
  text: string,
  date: string,
): GoalContributionInput {
  return { source: 'MANUAL', kind, amount: amountOf(text).amount, date: LocalDate.parse(date) };
}

async function tryContribution(
  world: TransactionsWorld,
  id: string,
  input: GoalContributionInput,
): Promise<void> {
  world.lastError = null;
  try {
    await world.addGoalContribution.execute(ANA, id, input);
  } catch (error) {
    world.lastError = error;
  }
}

Given(
  'que aporté {string} a {string} el {fecha}',
  async function (this: TransactionsWorld, text: string, name: string, date: string) {
    await this.addGoalContribution.execute(
      ANA,
      goalId(this, name),
      manual('CONTRIBUTION', text, date),
    );
  },
);

Given(
  'que retiré {string} de {string} el {fecha}',
  async function (this: TransactionsWorld, text: string, name: string, date: string) {
    await this.addGoalContribution.execute(
      ANA,
      goalId(this, name),
      manual('WITHDRAWAL', text, date),
    );
  },
);

When(
  'intento aportar {string} a {string} el {fecha}',
  async function (this: TransactionsWorld, text: string, name: string, date: string) {
    await tryContribution(this, goalId(this, name), manual('CONTRIBUTION', text, date));
  },
);

When(
  'intento retirar {string} de {string} el {fecha}',
  async function (this: TransactionsWorld, text: string, name: string, date: string) {
    await tryContribution(this, goalId(this, name), manual('WITHDRAWAL', text, date));
  },
);

When(
  'intento aportar {string} a la meta de Bruno',
  async function (this: TransactionsWorld, text: string) {
    await tryContribution(
      this,
      goalId(this, 'Viaje', BRUNO),
      manual('CONTRIBUTION', text, '2026-10-01'),
    );
  },
);

When(
  'intento deshacer el aporte de {string} a {string}',
  async function (this: TransactionsWorld, text: string, name: string) {
    const id = goalId(this, name);
    const contributions = await this.listGoalContributions.execute(ANA, id);
    const target = contributions.find(
      (view) => view.kind === 'CONTRIBUTION' && view.amount?.toFixed() === amountOf(text).amount,
    );
    assert.ok(target !== undefined, `There is no contribution of ${text} to «${name}».`);
    this.lastError = null;
    try {
      await this.deleteGoalContribution.execute(ANA, id, target.contribution.id);
    } catch (error) {
      this.lastError = error;
    }
  },
);

// --- Aportes enlazados a una transacción ----------------------------------------------------------

/** Un movimiento del tipo de su categoría, recordado como «ese ahorro» o «ese gasto». */
async function register(
  world: TransactionsWorld,
  text: string,
  name: string,
  date: string,
): Promise<Transaction> {
  const categoryId = world.categoryId(ANA, name);
  const transaction = await world.create({
    ...amountOf(text),
    date,
    categoryId,
    type: world.categoryType(categoryId),
  });
  world.remembered.set('esa transacción', transaction);

  return transaction;
}

function remembered(world: TransactionsWorld): Transaction {
  const transaction = world.remembered.get('esa transacción');
  assert.ok(transaction !== undefined, 'The scenario has not registered a transaction yet.');

  return transaction;
}

Given(
  'que ahorré {string} en {string} el {fecha}',
  async function (this: TransactionsWorld, text: string, name: string, date: string) {
    await register(this, text, name, date);
  },
);

Given(
  'que gasté {string} en {string} el {fecha}',
  async function (this: TransactionsWorld, text: string, name: string, date: string) {
    await register(this, text, name, date);
  },
);

Given('que enlacé ese ahorro a {string}', async function (this: TransactionsWorld, name: string) {
  await this.addGoalContribution.execute(ANA, goalId(this, name), {
    source: 'TRANSACTION',
    transactionId: remembered(this).id,
  });
});

When(
  /^intento enlazar ese (?:ahorro|gasto) a "([^"]+)"$/u,
  async function (this: TransactionsWorld, name: string) {
    await tryContribution(this, goalId(this, name), {
      source: 'TRANSACTION',
      transactionId: remembered(this).id,
    });
  },
);

When('corrijo ese ahorro a {string}', async function (this: TransactionsWorld, text: string) {
  await this.updateTransaction.execute({
    userId: ANA,
    id: remembered(this).id,
    changes: { amount: amountOf(text).amount },
  });
});

When('borro ese ahorro', async function (this: TransactionsWorld) {
  await this.deleteTransaction.execute({ userId: ANA, id: remembered(this).id });
});

// --- Cómo va --------------------------------------------------------------------------------------

async function goalNamed(world: TransactionsWorld, name: string): Promise<GoalView> {
  const views = await world.listGoals.execute(ANA, { includeArchived: true });
  const view = views.find((entry) => entry.goal.name === name);
  assert.ok(view !== undefined, `There is no goal «${name}».`);

  return view;
}

function seen(world: TransactionsWorld): GoalView {
  assert.ok(world.goal !== null, 'The scenario has not looked at a goal yet.');

  return world.goal;
}

When('veo la meta {string}', async function (this: TransactionsWorld, name: string) {
  this.goal = await goalNamed(this, name);
});

Then(
  /^llevo "([^"]+)" de la meta, el (-?\d+\.\d{2}) %$/u,
  function (this: TransactionsWorld, text: string, percentage: string) {
    const { progress } = seen(this);
    sameMoney(progress.saved, text);
    assert.equal(formatPercentage(progress.percentage.toString()), percentage);
  },
);

Then('me faltan {string}', function (this: TransactionsWorld, text: string) {
  sameMoney(seen(this).progress.remaining, text);
});

Then('me pasé por {string}', function (this: TransactionsWorld, text: string) {
  sameMoney(seen(this).progress.excess, text);
});

Then('el aporte mensual sugerido es {string}', function (this: TransactionsWorld, text: string) {
  const { suggestedMonthly } = seen(this).progress;
  assert.ok(suggestedMonthly !== null, 'There is no suggested monthly contribution.');
  sameMoney(suggestedMonthly, text);
});

Then('no hay aporte mensual sugerido', function (this: TransactionsWorld) {
  assert.equal(seen(this).progress.suggestedMonthly, null);
});

Then(/^se esperaba el (\d+\.\d{2}) %$/u, function (this: TransactionsWorld, percentage: string) {
  assert.equal(formatPercentage(seen(this).progress.expectedPercentage.toString()), percentage);
});

const STATUSES: Readonly<Record<string, GoalStatus>> = {
  'en curso': 'ON_TRACK',
  'en riesgo': 'AT_RISK',
  cumplida: 'ACHIEVED',
  vencida: 'OVERDUE',
};

Then(
  /^la meta está (en curso|en riesgo|cumplida|vencida)$/u,
  function (this: TransactionsWorld, status: string) {
    assert.equal(seen(this).progress.status, STATUSES[status]);
  },
);

Then(
  '{string} lleva {string}',
  async function (this: TransactionsWorld, name: string, text: string) {
    sameMoney((await goalNamed(this, name)).progress.saved, text);
  },
);

When('veo mis metas', async function (this: TransactionsWorld) {
  this.goalList = await this.listGoals.execute(ANA, { includeArchived: true });
});

Then(
  'veo solo la meta {string} de {string}',
  function (this: TransactionsWorld, name: string, text: string) {
    assert.deepEqual(
      this.goalList.map((view) => [view.goal.name, view.goal.target.toFixed()]),
      [[name, amountOf(text).amount]],
    );
  },
);

Then('se rechaza con {string}', function (this: TransactionsWorld, code: string) {
  assert.equal((this.lastError as { code?: string } | null)?.code, code, describe(this.lastError));
});
