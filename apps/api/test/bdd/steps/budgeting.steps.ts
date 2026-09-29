import assert from 'node:assert/strict';

import { type DataTable, Given, Then, When } from '@cucumber/cucumber';
import { type Currency, formatPercentage, Money } from '@sol-a-sol/domain';

import type { Budget } from '../../../src/modules/budgeting/application/budgets.js';
import { amountOf, currencyNamed, describe, type Month, sameMoney } from '../support/readers.js';
import { ANA, BRUNO, type TransactionsWorld } from '../world.js';

// --- Armar el presupuesto -------------------------------------------------------------------------

/** Agrega una partida al mes, conservando las que ya tenía: el `PUT` reemplaza el mes entero. */
async function budgetFor(
  world: TransactionsWorld,
  month: Month,
  categoryId: string,
  text: string,
): Promise<void> {
  const current = await world.getBudget.execute({ userId: ANA, ...month });
  const { amount, currency } = amountOf(text);
  world.lastError = null;
  try {
    world.budget = await world.replaceBudget.execute({ userId: ANA, ...month }, [
      ...current.lines.map((line) => ({
        categoryId: line.categoryId,
        plannedAmount: line.planned.toFixed(),
        currency: line.planned.currency,
      })),
      { categoryId, plannedAmount: amount, currency },
    ]);
  } catch (error) {
    world.lastError = error;
  }
}

function assertBudgetAccepted(world: TransactionsWorld): void {
  assert.equal(world.lastError, null, `Expected it to be accepted: ${describe(world.lastError)}`);
}

Given(
  'que presupuesté {string} para {string} en {mes}',
  async function (this: TransactionsWorld, text: string, name: string, month: Month) {
    await budgetFor(this, month, this.categoryId(ANA, name), text);
    assertBudgetAccepted(this);
  },
);

async function tryToBudget(this: TransactionsWorld, text: string, name: string, month: Month) {
  await budgetFor(this, month, this.categoryId(ANA, name), text);
}

When('presupuesto {string} para {string} en {mes}', tryToBudget);
When('intento presupuestar {string} para {string} en {mes}', tryToBudget);

When(
  'intento presupuestar {string} para la categoría de Bruno en {mes}',
  async function (this: TransactionsWorld, text: string, month: Month) {
    await budgetFor(this, month, this.ids.get('bruno category') ?? '', text);
  },
);

Then('se rechaza porque la partida va en la categoría madre', function (this: TransactionsWorld) {
  assert.equal(
    (this.lastError as { code?: string } | null)?.code,
    'BUDGET_CATEGORY_NOT_TOP_LEVEL',
    describe(this.lastError),
  );
});

Then(
  'se rechaza porque el monto planeado no puede ser negativo',
  function (this: TransactionsWorld) {
    assert.equal(
      (this.lastError as { code?: string } | null)?.code,
      'BUDGET_AMOUNT_NEGATIVE',
      describe(this.lastError),
    );
  },
);

Given(
  'que Bruno presupuestó {string} para su categoría {string} en {mes}',
  async function (this: TransactionsWorld, text: string, name: string, month: Month) {
    const categoryId = this.addCategory(BRUNO, name, 'VARIABLE_EXPENSE');
    const { amount, currency } = amountOf(text);
    await this.replaceBudget.execute({ userId: BRUNO, ...month }, [
      { categoryId, plannedAmount: amount, currency },
    ]);
  },
);

// --- Lo real: movimientos registrados como en la aplicación -------------------------------------

/** Un movimiento del tipo de su categoría: gasto, ingreso o ahorro, según dónde se registra. */
async function register(this: TransactionsWorld, text: string, name: string, date: string) {
  const categoryId = this.categoryId(ANA, name);
  await this.create({ ...amountOf(text), date, categoryId, type: this.categoryType(categoryId) });
}

Given('gasté {string} en {string} el {fecha}', register);
Given('recibí {string} en {string} el {fecha}', register);
Given('ahorré {string} en {string} el {fecha}', register);

// --- Ver cómo va ----------------------------------------------------------------------------------

When('veo el presupuesto de {mes}', async function (this: TransactionsWorld, month: Month) {
  this.budget = await this.getBudget.execute({ userId: ANA, ...month });
});

function viewed(world: TransactionsWorld): Budget {
  assert.ok(world.budget !== null, 'The scenario has not looked at a budget yet.');

  return world.budget;
}

function lineOf(world: TransactionsWorld, name: string, currency: Currency = 'PEN') {
  const categoryId = world.categoryId(ANA, name);
  const line = viewed(world)
    .summary.filter((report) => report.currency === currency)
    .flatMap((report) => report.lines)
    .find((candidate) => candidate.categoryId === categoryId);
  assert.ok(line !== undefined, `«${name}» has no line in ${currency}.`);

  return line;
}

Then(
  '{string} está dentro del límite y quedan {string}',
  function (this: TransactionsWorld, name: string, text: string) {
    const line = lineOf(this, name, amountOf(text).currency);
    assert.equal(line.status, 'WITHIN');
    sameMoney(line.difference, text);
  },
);

Then(
  '{string} está excedida por {string}',
  function (this: TransactionsWorld, name: string, text: string) {
    const line = lineOf(this, name, amountOf(text).currency);
    assert.equal(line.status, 'EXCEEDED');
    // La diferencia es «lo bueno es positivo»: pasarse la deja negativa.
    sameMoney(Money.zero(line.difference.currency).subtract(line.difference), text);
  },
);

Then(
  'a {string} le faltan {string}',
  function (this: TransactionsWorld, name: string, text: string) {
    const line = lineOf(this, name, amountOf(text).currency);
    assert.equal(line.status, 'PENDING');
    sameMoney(Money.zero(line.difference.currency).subtract(line.difference), text);
  },
);

Then('{string} está cumplida', function (this: TransactionsWorld, name: string) {
  assert.equal(lineOf(this, name).status, 'MET');
});

Then(
  /^el ejecutado de "([^"]+)" es (\d+\.\d{2}) %$/u,
  function (this: TransactionsWorld, name: string, percentage: string) {
    const { executed } = lineOf(this, name);
    assert.ok(executed !== null, `«${name}» has no executed percentage.`);
    assert.equal(formatPercentage(executed.toString()), percentage);
  },
);

Then('{string} no tiene porcentaje ejecutado', function (this: TransactionsWorld, name: string) {
  assert.equal(lineOf(this, name).executed, null);
});

Then(
  /^lo gastado sin presupuesto en (soles|dólares) es "([^"]+)"$/u,
  function (this: TransactionsWorld, name: string, text: string) {
    const currency = currencyNamed(name);
    const unbudgeted = viewed(this)
      .summary.filter((report) => report.currency === currency)
      .flatMap((report) => report.unbudgeted);
    sameMoney(
      unbudgeted.reduce((total, entry) => total.add(entry.amount), Money.zero(currency)),
      text,
    );
  },
);

Then(
  /^el gasto variable en (soles|dólares) suma "([^"]+)" de "([^"]+)"$/u,
  function (this: TransactionsWorld, name: string, actual: string, planned: string) {
    const currency = currencyNamed(name);
    const report = viewed(this).summary.find(
      (candidate) => candidate.type === 'VARIABLE_EXPENSE' && candidate.currency === currency,
    );
    assert.ok(report !== undefined, `No variable spending in ${currency}.`);
    sameMoney(report.total.actual, actual);
    sameMoney(report.total.planned, planned);
  },
);

// --- El presupuesto guardado ---------------------------------------------------------------------

Then(
  'el presupuesto de {mes} queda así:',
  async function (this: TransactionsWorld, month: Month, table: DataTable) {
    assertBudgetAccepted(this);
    const { lines } = await this.getBudget.execute({ userId: ANA, ...month });
    assert.deepEqual(
      lines.map((line) => [line.categoryId, `${line.planned.currency} ${line.planned.toFixed()}`]),
      table.hashes().map((row) => {
        const { amount, currency } = amountOf(row.planeado ?? '');

        return [this.categoryId(ANA, row['categoría'] ?? ''), `${currency} ${amount}`];
      }),
    );
  },
);

Then('el presupuesto de {mes} está vacío', async function (this: TransactionsWorld, month: Month) {
  const { lines } = await this.getBudget.execute({ userId: ANA, ...month });
  assert.deepEqual(lines, []);
});

// --- Copiar del mes anterior ---------------------------------------------------------------------

When(
  'copio el presupuesto anterior a {mes}',
  async function (this: TransactionsWorld, month: Month) {
    this.copied = await this.copyBudget.execute({ userId: ANA, ...month });
  },
);

Then('se copió de {mes}', function (this: TransactionsWorld, month: Month) {
  assert.deepEqual(this.copied?.copiedFrom, month);
});

Then('no se copió de ningún mes', function (this: TransactionsWorld) {
  assert.ok(this.copied !== null, 'The scenario did not copy anything.');
  assert.equal(this.copied.copiedFrom, null);
});

Then('se avisa que {string} no se copió', function (this: TransactionsWorld, name: string) {
  assert.deepEqual(
    this.copied?.skipped.map((entry) => entry.categoryId),
    [this.categoryId(ANA, name)],
  );
});

// --- Fusionar categorías --------------------------------------------------------------------------

When(
  'fusiono {string} en {string}',
  async function (this: TransactionsWorld, from: string, into: string) {
    // Lo que `catalog` publica al fusionar; el presupuesto lo escucha.
    await this.budgetMergeListener.handle({
      userId: ANA,
      fromId: this.categoryId(ANA, from),
      intoId: this.categoryId(ANA, into),
    });
  },
);
