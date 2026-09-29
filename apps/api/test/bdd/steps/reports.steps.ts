import assert from 'node:assert/strict';

import { type DataTable, Given, Then, When } from '@cucumber/cucumber';
import { formatPercentage, LocalDate } from '@sol-a-sol/domain';

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
