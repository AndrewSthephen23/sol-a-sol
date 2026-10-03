import assert from 'node:assert/strict';

import { type DataTable, Given, Then, When } from '@cucumber/cucumber';
import { formatPercentage, LocalDate, Money } from '@sol-a-sol/domain';

import type { SummarySection } from '../../../src/modules/reports/ports/report-readers.js';

import { amountOf, currencyNamed, type Month, sameMoney } from '../support/readers.js';
import { ANA, type TransactionsWorld } from '../world.js';

// --- Lo registrado --------------------------------------------------------------------------------

Given(
  'que registré estos movimientos:',
  async function (this: TransactionsWorld, table: DataTable) {
    for (const row of table.hashes()) {
      const categoryId = this.categoryId(ANA, row['categoría'] ?? '');
      await this.create({
        ...amountOf(row.monto ?? ''),
        date: LocalDate.parseDayFirst(row.fecha ?? '').toString(),
        categoryId,
        type: this.categoryType(categoryId),
      });
    }
  },
);

Given(
  'que gasté esto en {mes}:',
  async function (this: TransactionsWorld, month: Month, table: DataTable) {
    const date = LocalDate.of(month.year, month.month, 10).toString();
    for (const row of table.hashes()) {
      const categoryId = this.ensureCategory(ANA, row['categoría'] ?? '', 'VARIABLE_EXPENSE');
      await this.create({ ...amountOf(row.monto ?? ''), date, categoryId });
    }
  },
);

Given(
  'transferí {string} de {string} a {string} el {fecha}',
  async function (this: TransactionsWorld, text: string, from: string, to: string, date: string) {
    await this.createTransfer.execute({
      userId: ANA,
      date,
      fromPaymentMethodId: this.methodId(ANA, from),
      toPaymentMethodId: this.methodId(ANA, to),
      ...amountOf(text),
      description: 'Entre mis cuentas',
      source: 'MANUAL',
    });
  },
);

// --- El resumen -----------------------------------------------------------------------------------

When('veo el resumen de {mes}', async function (this: TransactionsWorld, month: Month) {
  this.dashboard = await this.monthlyDashboard.execute({ userId: ANA, ...month });
});

function inCurrency(world: TransactionsWorld, name: string) {
  const currency = currencyNamed(name);
  assert.ok(world.dashboard !== null, 'The scenario has not looked at the dashboard yet.');

  return world.dashboard.currencies.find((entry) => entry.currency === currency);
}

function shown(world: TransactionsWorld, name = 'soles') {
  const dashboard = inCurrency(world, name);
  assert.ok(dashboard !== undefined, `There is no dashboard in ${name}.`);

  return dashboard;
}

Then(
  /^el resumen en (soles|dólares) es:$/u,
  function (this: TransactionsWorld, name: string, table: DataTable) {
    const [row] = table.hashes();
    assert.ok(row !== undefined);
    const { kpis } = shown(this, name);
    sameMoney(kpis.income, row.ingresos ?? '');
    sameMoney(kpis.expense, row.gastos ?? '');
    sameMoney(kpis.saving, row.ahorro ?? '');
    sameMoney(kpis.debt, row.deuda ?? '');
    sameMoney(kpis.balance, row.saldo ?? '');
  },
);

Then(/^no hay resumen en (soles|dólares)$/u, function (this: TransactionsWorld, name: string) {
  assert.equal(inCurrency(this, name), undefined);
});

Then('no hay resumen del mes', function (this: TransactionsWorld) {
  assert.deepEqual(this.dashboard?.currencies, []);
});

Then(
  /^el gasto en (soles|dólares) es "([^"]+)"$/u,
  function (this: TransactionsWorld, name: string, text: string) {
    sameMoney(shown(this, name).kpis.expense, text);
  },
);

Then(
  /^el saldo en (soles|dólares) del resumen es "([^"]+)"$/u,
  function (this: TransactionsWorld, name: string, text: string) {
    sameMoney(shown(this, name).kpis.balance, text);
  },
);

// --- Las barras -----------------------------------------------------------------------------------

Then('hay {int} barras', function (this: TransactionsWorld, bars: number) {
  assert.equal(shown(this).daily.length, bars);
});

Then(
  'la barra del {fecha} es {string}',
  function (this: TransactionsWorld, date: string, text: string) {
    const bar = shown(this).daily.find((entry) => entry.date.toString() === date);
    assert.ok(bar !== undefined, `There is no bar for ${date}.`);
    sameMoney(bar.amount, text);
  },
);

// --- La dona --------------------------------------------------------------------------------------

Then(
  /^la dona en (soles|dólares) es:$/u,
  function (this: TransactionsWorld, name: string, table: DataTable) {
    assert.deepEqual(
      shown(this, name).distribution.map((slice) => [
        slice.categoryId,
        `${slice.amount.currency} ${slice.amount.toFixed()}`,
        slice.share === null ? null : `${formatPercentage(slice.share.toString())} %`,
      ]),
      table.hashes().map((row) => {
        const { amount, currency } = amountOf(row.monto ?? '');
        const slice = row['porción'] ?? '';

        return [
          slice === 'Otras' ? null : this.categoryId(ANA, slice),
          `${currency} ${amount}`,
          row.parte,
        ];
      }),
    );
  },
);

// --- Resumen mensual: el cierre del mes ------------------------------------------------------------

const TYPES_BY_NAME: Readonly<Record<string, string>> = {
  ingresos: 'INCOME',
  'gasto fijo': 'FIXED_EXPENSE',
  'gasto variable': 'VARIABLE_EXPENSE',
  ahorro: 'SAVING',
  inversión: 'INVESTMENT',
  deuda: 'DEBT',
};

const SECTIONS: Readonly<
  Record<string, { flag: SummarySection; key: 'budget' | 'cards' | 'goals' }>
> = {
  presupuesto: { flag: 'budgeting', key: 'budget' },
  tarjetas: { flag: 'credit-cards', key: 'cards' },
  metas: { flag: 'goals', key: 'goals' },
};

Given(
  'que gasté {string} en {string} en {string} el {fecha}',
  async function (
    this: TransactionsWorld,
    text: string,
    name: string,
    merchant: string,
    date: string,
  ) {
    const categoryId = this.categoryId(ANA, name);
    await this.create({
      ...amountOf(text),
      date,
      categoryId,
      type: this.categoryType(categoryId),
      merchant,
    });
  },
);

Given(
  /^que el módulo de (presupuesto|tarjetas|metas) está apagado$/u,
  function (this: TransactionsWorld, section: string) {
    this.reportFlags.turnOff(SECTIONS[section]?.flag ?? 'budgeting');
  },
);

When('veo el cierre de {mes}', async function (this: TransactionsWorld, month: Month) {
  this.monthlySummary = await this.monthlySummaryUseCase.execute({ userId: ANA, ...month });
});

When('intento ver el cierre de {mes}', async function (this: TransactionsWorld, month: Month) {
  this.lastError = null;
  try {
    await this.monthlySummaryUseCase.execute({ userId: ANA, ...month });
  } catch (error) {
    this.lastError = error;
  }
});

function closed(world: TransactionsWorld) {
  assert.ok(world.monthlySummary !== null, 'The scenario has not looked at a monthly summary yet.');

  return world.monthlySummary;
}

function closedIn(world: TransactionsWorld, name: string) {
  const currency = currencyNamed(name);
  const found = closed(world).summary.currencies.find((entry) => entry.currency === currency);
  assert.ok(found !== undefined, `The monthly summary has nothing in ${name}.`);

  return found;
}

Then(
  'el cierre va del {fecha} al {fecha} y se compara con el {fecha} al {fecha}',
  function (
    this: TransactionsWorld,
    from: string,
    to: string,
    previousFrom: string,
    previousTo: string,
  ) {
    const { current, previous } = closed(this).periods;
    assert.deepEqual([current.from, current.to, previous.from, previous.to].map(String), [
      from,
      to,
      previousFrom,
      previousTo,
    ]);
  },
);

Then(
  /^en el cierre, el (ingresos|gasto fijo|gasto variable|ahorro|inversión|deuda) en (soles|dólares) va de "([^"]+)" a "([^"]+)" \((.+)\)$/u,
  function (
    this: TransactionsWorld,
    type: string,
    name: string,
    before: string,
    now: string,
    change: string,
  ) {
    const row = closedIn(this, name).byType.find((entry) => entry.type === TYPES_BY_NAME[type]);
    assert.ok(row !== undefined);
    sameMoney(row.previous, before);
    sameMoney(row.amount, now);
    assert.equal(
      row.change === null
        ? 'sin porcentaje'
        : `${row.change.isNegative() ? '' : '+'}${formatPercentage(row.change.toString())} %`,
      change,
    );
  },
);

Then(
  /^la tasa de ahorro del cierre en (soles|dólares) es (\d+\.\d{2}) %$/u,
  function (this: TransactionsWorld, name: string, percentage: string) {
    const rate = closedIn(this, name).savingsRate;
    assert.ok(rate !== null, 'There is no savings rate.');
    assert.equal(formatPercentage(rate.toString()), percentage);
  },
);

Then(
  /^no hay tasa de ahorro del cierre en (soles|dólares)$/u,
  function (this: TransactionsWorld, name: string) {
    assert.equal(closedIn(this, name).savingsRate, null);
  },
);

Then(
  /^los comercios donde más gasté en (soles|dólares) son:$/u,
  function (this: TransactionsWorld, name: string, table: DataTable) {
    assert.deepEqual(
      closedIn(this, name).topMerchants.map((entry) => [
        entry.merchant,
        `${entry.amount.currency} ${entry.amount.toFixed()}`,
        String(entry.count),
      ]),
      table.hashes().map((row) => {
        const { amount, currency } = amountOf(row.monto ?? '');

        return [row.comercio, `${currency} ${amount}`, row.compras];
      }),
    );
  },
);

Then(
  /^las categorías donde más gasté en (soles|dólares) son "([^"]+)"$/u,
  function (this: TransactionsWorld, name: string, list: string) {
    assert.deepEqual(
      closedIn(this, name).topCategories.map((entry) => entry.categoryId),
      list.split(', ').map((category) => this.categoryId(ANA, category)),
    );
  },
);

function setBudget(world: TransactionsWorld) {
  const { budget } = closed(world).summary;
  assert.ok(budget?.status === 'SET', `Expected a budget: ${JSON.stringify(budget)}`);

  return budget;
}

Then(
  /^en el cierre se ejecutó el (\d+\.\d{2}) % del presupuesto en (soles|dólares)$/u,
  function (this: TransactionsWorld, percentage: string, name: string) {
    const row = setBudget(this).currencies.find((entry) => entry.currency === currencyNamed(name));
    assert.ok(row?.executed != null, 'There is no executed share.');
    assert.equal(formatPercentage(row.executed.toString()), percentage);
  },
);

Then(
  'en el cierre me pasé en {string} por {string}',
  function (this: TransactionsWorld, category: string, text: string) {
    const lines = setBudget(this).exceeded;
    assert.deepEqual(
      lines.map((line) => line.categoryId),
      [this.categoryId(ANA, category)],
    );
    sameMoney(lines[0]?.difference.multiply('-1') ?? Money.zero('PEN'), text);
  },
);

Then('en el cierre no me pasé en ninguna partida', function (this: TransactionsWorld) {
  assert.deepEqual(setBudget(this).exceeded, []);
});

Then('el cierre dice que no hay presupuesto', function (this: TransactionsWorld) {
  assert.deepEqual(closed(this).summary.budget, { status: 'NONE' });
});

function summaryCard(world: TransactionsWorld, alias: string) {
  // El id con que la configuraron los pasos de tarjetas: el fake del catálogo no usa el alias.
  const cardId = world.ids.get(`card ${ANA}/${alias}`);
  const card = closed(world).summary.cards?.find((entry) => entry.cardId === cardId);
  assert.ok(card !== undefined, `The monthly summary has no card «${alias}».`);

  return card;
}

Then(
  'en el cierre la {string} consumió {string}',
  function (this: TransactionsWorld, alias: string, text: string) {
    const card = summaryCard(this, alias);
    assert.equal(card.charges.length, 1);
    sameMoney(card.charges[0] ?? Money.zero('PEN'), text);
    this.ids.set('summary card', alias);
  },
);

Then(
  'su estado del {fecha} vence el {fecha} y le falta pagar {string}',
  function (this: TransactionsWorld, closing: string, due: string, text: string) {
    const { statement } = summaryCard(this, this.ids.get('summary card') ?? '');
    assert.ok(statement !== null, 'There is no statement due next month.');
    assert.deepEqual(
      [statement.closingDate.toString(), statement.dueDate.toString()],
      [closing, due],
    );
    sameMoney(statement.balances[0]?.remaining ?? Money.zero('PEN'), text);
  },
);

Then(
  'en el cierre {string} recibió {string} y llevaba {string}',
  function (this: TransactionsWorld, name: string, contributed: string, saved: string) {
    const view = closed(this);
    const goal = view.summary.goals?.find((entry) => view.goals.get(entry.goalId)?.name === name);
    assert.ok(goal !== undefined, `The monthly summary has no goal «${name}».`);
    sameMoney(goal.contributed, contributed);
    sameMoney(goal.progress.saved, saved);
  },
);

Then(
  /^el cierre no tiene (presupuesto|tarjetas|metas)$/u,
  function (this: TransactionsWorld, section: string) {
    const key = SECTIONS[section]?.key ?? 'budget';
    assert.equal(key in closed(this).summary, false, `The summary has ${key}.`);
    assert.ok(closed(this).summary.currencies.length > 0, 'The rest of the summary is missing.');
  },
);

// --- Resumen anual: el año mes a mes -------------------------------------------------------------

const ROWS_BY_NAME: Readonly<Record<string, string>> = {
  ...TYPES_BY_NAME,
  'total gasto': 'EXPENSE',
  saldo: 'BALANCE',
};

const MONTH_NAMES = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
];

When('veo el año {int}', async function (this: TransactionsWorld, year: number) {
  this.annualSummary = await this.annualSummaryUseCase.execute({ userId: ANA, year });
});

When('intento ver el año {int}', async function (this: TransactionsWorld, year: number) {
  this.lastError = null;
  try {
    await this.annualSummaryUseCase.execute({ userId: ANA, year });
  } catch (error) {
    this.lastError = error;
  }
});

function yearIn(world: TransactionsWorld, name: string) {
  assert.ok(world.annualSummary !== null, 'The scenario has not looked at a year yet.');
  const found = world.annualSummary.currencies.find(
    (entry) => entry.currency === currencyNamed(name),
  );
  assert.ok(found !== undefined, `The year has nothing in ${name}.`);

  return found;
}

function yearRow(world: TransactionsWorld, row: string, name: string) {
  const found = yearIn(world, name).rows.find((entry) => entry.row === ROWS_BY_NAME[row]);
  assert.ok(found !== undefined, `There is no row «${row}».`);

  return found;
}

const ROW_NAMES = '(ingresos|gasto fijo|gasto variable|total gasto|ahorro|inversión|deuda|saldo)';
const MONTH_PATTERN =
  '(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)';

Then(
  new RegExp(
    `^en el año, el ${ROW_NAMES} en (soles|dólares) de ${MONTH_PATTERN} es "([^"]+)"$`,
    'u',
  ),
  function (this: TransactionsWorld, row: string, name: string, month: string, text: string) {
    const amount = yearRow(this, row, name).months[MONTH_NAMES.indexOf(month)];
    assert.ok(amount != null, `${month} is empty.`);
    sameMoney(amount, text);
  },
);

Then(
  new RegExp(`^en el año, el ${ROW_NAMES} en (soles|dólares) de ${MONTH_PATTERN} está vacío$`, 'u'),
  function (this: TransactionsWorld, row: string, name: string, month: string) {
    assert.equal(yearRow(this, row, name).months[MONTH_NAMES.indexOf(month)], null);
  },
);

Then(
  new RegExp(`^en el año, el ${ROW_NAMES} en (soles|dólares) suma "([^"]+)"$`, 'u'),
  function (this: TransactionsWorld, row: string, name: string, text: string) {
    sameMoney(yearRow(this, row, name).total, text);
  },
);

Then(
  /^la tasa de ahorro del año en (soles|dólares) es (\d+\.\d{2}) %$/u,
  function (this: TransactionsWorld, name: string, percentage: string) {
    const rate = yearIn(this, name).savingsRate;
    assert.ok(rate !== null, 'There is no savings rate.');
    assert.equal(formatPercentage(rate.toString()), percentage);
  },
);

Then(
  /^no hay tasa de ahorro del año en (soles|dólares)$/u,
  function (this: TransactionsWorld, name: string) {
    assert.equal(yearIn(this, name).savingsRate, null);
  },
);
