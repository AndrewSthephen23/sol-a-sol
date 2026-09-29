import assert from 'node:assert/strict';

import { Given, Then, When } from '@cucumber/cucumber';
import { type Currency, FixedClock, LocalDate } from '@sol-a-sol/domain';

import type { TransactionPage } from '../../../src/modules/transactions/application/transactions.js';
import { amountOf, describe, sameMoney } from '../support/readers.js';
import { ANA, BRUNO, type TransactionsWorld } from '../world.js';

// Los montos y las fechas se leen en `support/readers.ts`, igual en todos los `.feature`.

function assertRejected(world: TransactionsWorld, code?: string): void {
  assert.ok(world.lastError !== null, 'Expected the attempt to be rejected, but it was accepted.');
  if (code !== undefined) {
    assert.equal((world.lastError as { code?: string }).code, code, describe(world.lastError));
  }
}

function assertAccepted(world: TransactionsWorld): void {
  assert.equal(world.lastError, null, `Expected it to be accepted: ${describe(world.lastError)}`);
  assert.ok(world.last !== null);
}

async function monthTotals(world: TransactionsWorld, currency: Currency = 'PEN') {
  const page = await world.list({ month: '2026-09' });
  const totals = page.totals.find((total) => total.currency === currency);
  assert.ok(totals !== undefined, `No totals in ${currency}.`);

  return totals;
}

function lastTransaction(world: TransactionsWorld) {
  assert.ok(world.last !== null, 'The scenario has not registered anything yet.');

  return world.last;
}

function idsOf(page: TransactionPage | null): string[] {
  assert.ok(page !== null, 'The scenario has not listed anything yet.');

  return page.items.map((item) => item.id);
}

// --- El monto siempre es positivo; el signo lo da el tipo ---------------------------------------

When(
  'registro un gasto variable de {string}',
  async function (this: TransactionsWorld, text: string) {
    await this.attempt(() => this.create(amountOf(text)));
  },
);

When('registro un gasto de {string}', async function (this: TransactionsWorld, text: string) {
  await this.attempt(() => this.create(amountOf(text)));
});

When(
  'intento registrar un gasto de {string}',
  async function (this: TransactionsWorld, text: string) {
    await this.attempt(() => this.create(amountOf(text)));
  },
);

When('registro un ahorro de {string}', async function (this: TransactionsWorld, text: string) {
  await this.attempt(() =>
    this.create({ ...amountOf(text), type: 'SAVING', categoryId: this.categoryId(ANA, 'Ahorro') }),
  );
});

Then('queda guardado por {string}', function (this: TransactionsWorld, text: string) {
  assertAccepted(this);
  sameMoney(lastTransaction(this).amount, text);
});

Then('resta {string} al saldo del mes', async function (this: TransactionsWorld, text: string) {
  const { amount, currency } = amountOf(text);
  sameMoney(
    (await monthTotals(this, currency)).balance,
    `${currency === 'PEN' ? 'S/' : 'US$'} -${amount}`,
  );
});

Then('suma {string} al ahorro del mes', async function (this: TransactionsWorld, text: string) {
  sameMoney((await monthTotals(this)).saving, text);
});

Then('se rechaza porque el monto debe ser mayor que cero', function (this: TransactionsWorld) {
  assertRejected(this, 'TRANSACTION_AMOUNT_NOT_POSITIVE');
});

// --- Gasto es fijo más variable; ahorro es ahorro más inversión ---------------------------------

Given('que pagué {string} de un préstamo', async function (this: TransactionsWorld, text: string) {
  await this.attempt(() =>
    this.create({ ...amountOf(text), type: 'DEBT', categoryId: this.categoryId(ANA, 'Préstamo') }),
  );
});

When('veo el gasto del mes', async function (this: TransactionsWorld) {
  this.page = await this.list({ month: '2026-09' });
});

Then('ese pago no está incluido', async function (this: TransactionsWorld) {
  sameMoney((await monthTotals(this)).expense, 'S/ 0.00');
});

Then('sí resta del saldo del mes', async function (this: TransactionsWorld) {
  const paid = lastTransaction(this).amount;
  sameMoney((await monthTotals(this)).balance, `S/ -${paid.toFixed()}`);
});

// --- Solo se registra lo que ya pasó -------------------------------------------------------------

Given('que hoy es {fecha} en Lima', function (this: TransactionsWorld, date: string) {
  // Mediodía en Lima (UTC-5): lejos de cualquier cambio de día.
  this.clock = FixedClock.at(`${date}T17:00:00.000Z`);
});

Given(
  /^que son las (\d{2}):(\d{2}) del (\d{2}\/\d{2}\/\d{4}) en Lima$/u,
  // Cucumber ya convierte el grupo de la fecha con el tipo `{fecha}`: llega como `YYYY-MM-DD`.
  function (this: TransactionsWorld, hours: string, minutes: string, day: string) {
    const date = LocalDate.parse(day);
    // Lima es UTC-5 todo el año: no tiene horario de verano.
    this.clock = FixedClock.at(
      new Date(Date.UTC(date.year, date.month - 1, date.day, Number(hours) + 5, Number(minutes))),
    );
  },
);

When(
  'intento registrar un gasto con fecha {fecha}',
  async function (this: TransactionsWorld, date: string) {
    await this.attempt(() => this.create({ amount: '10.00', date }));
  },
);

When('registro un gasto con fecha {fecha}', async function (this: TransactionsWorld, date: string) {
  await this.attempt(() => this.create({ amount: '10.00', date }));
});

Then('se rechaza porque la fecha es futura', function (this: TransactionsWorld) {
  assertRejected(this, 'TRANSACTION_DATE_IN_FUTURE');
});

Then('queda guardado', function (this: TransactionsWorld) {
  assertAccepted(this);
});

// --- La moneda nunca se supone ni se convierte ----------------------------------------------------

Given('que tengo la cuenta {string} en soles', function (this: TransactionsWorld, alias: string) {
  this.ids.set('chosen method', this.addPaymentMethod(ANA, alias, 'PEN'));
});

Given('que tengo la tarjeta bimoneda {string}', function (this: TransactionsWorld, alias: string) {
  this.ids.set('chosen method', this.addPaymentMethod(ANA, alias, null));
});

When(
  'registro un gasto con esa cuenta sin indicar moneda',
  async function (this: TransactionsWorld) {
    const paymentMethodId = this.ids.get('chosen method') ?? null;
    await this.attempt(() => this.create({ amount: '10.00', currency: null, paymentMethodId }));
  },
);

When(
  'intento registrar un gasto con esa tarjeta sin indicar moneda',
  async function (this: TransactionsWorld) {
    const paymentMethodId = this.ids.get('chosen method') ?? null;
    await this.attempt(() => this.create({ amount: '10.00', currency: null, paymentMethodId }));
  },
);

Then('queda en soles', function (this: TransactionsWorld) {
  assertAccepted(this);
  assert.equal(lastTransaction(this).amount.currency, 'PEN');
});

Then('se rechaza pidiendo la moneda', function (this: TransactionsWorld) {
  assertRejected(this, 'TRANSACTION_CURRENCY_REQUIRED');
});

// --- La categoría coincide con el tipo y está activa --------------------------------------------

Given(
  'que tengo la categoría de gasto variable {string}',
  function (this: TransactionsWorld, name: string) {
    this.addCategory(ANA, name, 'VARIABLE_EXPENSE');
  },
);

When(
  'intento registrar un ingreso en {string}',
  async function (this: TransactionsWorld, name: string) {
    await this.attempt(() =>
      this.create({ amount: '10.00', type: 'INCOME', categoryId: this.categoryId(ANA, name) }),
    );
  },
);

Then('se rechaza', function (this: TransactionsWorld) {
  assertRejected(this);
});

Given('que archivé la categoría {string}', async function (this: TransactionsWorld, name: string) {
  // Tenía gastos de antes: archivarla no los borra.
  const id = this.addCategory(ANA, name, 'VARIABLE_EXPENSE');
  await this.create({ amount: '44.90', categoryId: id, date: '2026-08-10' });
  this.archiveCategory(ANA, name, 'VARIABLE_EXPENSE');
});

When(
  'intento registrar un gasto en {string}',
  async function (this: TransactionsWorld, name: string) {
    await this.attempt(() =>
      this.create({ amount: '10.00', categoryId: this.categoryId(ANA, name) }),
    );
  },
);

Then(
  'mis gastos viejos siguen en {string}',
  async function (this: TransactionsWorld, name: string) {
    const page = await this.list({ categoryId: this.categoryId(ANA, name) });
    assert.equal(page.items.length, 1);
  },
);

Given(
  'que tengo la categoría {string} con la subcategoría {string}',
  function (this: TransactionsWorld, parent: string, child: string) {
    this.addCategory(ANA, parent, 'VARIABLE_EXPENSE');
    this.addCategory(ANA, child, 'VARIABLE_EXPENSE', { parent });
  },
);

When('registro un gasto en {string}', async function (this: TransactionsWorld, name: string) {
  await this.attempt(() =>
    this.create({ amount: '10.00', categoryId: this.categoryId(ANA, name) }),
  );
});

Then('queda guardado en {string}', function (this: TransactionsWorld, name: string) {
  assertAccepted(this);
  assert.equal(lastTransaction(this).categoryId, this.categoryId(ANA, name));
});

// --- El método de pago es opcional, pero si se indica debe estar activo -------------------------

When(
  'registro un gasto de {string} sin indicar con qué pagué',
  async function (this: TransactionsWorld, text: string) {
    await this.attempt(() => this.create({ ...amountOf(text), paymentMethodId: null }));
  },
);

Then('queda guardado sin método de pago', function (this: TransactionsWorld) {
  assertAccepted(this);
  assert.equal(lastTransaction(this).paymentMethodId, null);
});

Given('que archivé la tarjeta {string}', function (this: TransactionsWorld, alias: string) {
  this.addPaymentMethod(ANA, alias, 'PEN', true);
});

When(
  'intento registrar un gasto con {string}',
  async function (this: TransactionsWorld, alias: string) {
    await this.attempt(() =>
      this.create({ amount: '10.00', paymentMethodId: this.methodId(ANA, alias) }),
    );
  },
);

Then('se rechaza porque el método de pago está archivado', function (this: TransactionsWorld) {
  assertRejected(this, 'PAYMENT_METHOD_ARCHIVED');
});

// --- El monto se guarda exacto, sin redondear ------------------------------------------------------

Then('se rechaza porque el monto tiene más de dos decimales', function (this: TransactionsWorld) {
  assertRejected(this, 'INVALID_AMOUNT');
});

// --- Cada quien ve solo lo suyo ------------------------------------------------------------------

Given('que Bruno tiene la categoría {string}', function (this: TransactionsWorld, name: string) {
  this.ids.set('bruno category', this.addCategory(BRUNO, name, 'VARIABLE_EXPENSE'));
});

When(
  'intento registrar un gasto en la categoría de Bruno',
  async function (this: TransactionsWorld) {
    const categoryId = this.ids.get('bruno category') ?? '';
    await this.attempt(() => this.create({ amount: '10.00', categoryId }));
  },
);

Then('la categoría no se encuentra', function (this: TransactionsWorld) {
  assertRejected(this, 'CATEGORY_NOT_FOUND');
});

async function brunoRegisters(world: TransactionsWorld, category = 'Almuerzos') {
  const categoryId = world.addCategory(BRUNO, category, 'VARIABLE_EXPENSE');
  const expense = await world.create({ userId: BRUNO, amount: '18.00', categoryId });
  world.remembered.set('bruno', expense);

  return expense;
}

Given('que Bruno registró un gasto', async function (this: TransactionsWorld) {
  await brunoRegisters(this);
});

Given(
  'que Bruno registró gastos en su categoría {string}',
  async function (this: TransactionsWorld, name: string) {
    await brunoRegisters(this, name);
    await this.create({ userId: BRUNO, amount: '21.00', categoryId: this.categoryId(BRUNO, name) });
  },
);

function brunos(world: TransactionsWorld) {
  const expense = world.remembered.get('bruno');
  assert.ok(expense !== undefined);

  return expense;
}

When('intento verlo', async function (this: TransactionsWorld) {
  await this.attempt(() => this.getTransaction.execute({ userId: ANA, id: brunos(this).id }));
});

When('intento borrarlo', async function (this: TransactionsWorld) {
  this.lastError = null;
  try {
    await this.deleteTransaction.execute({ userId: ANA, id: brunos(this).id });
  } catch (error) {
    this.lastError = error;
  }
});

Then('la transacción no se encuentra', function (this: TransactionsWorld) {
  assertRejected(this, 'TRANSACTION_NOT_FOUND');
});

Then('Bruno la sigue viendo', async function (this: TransactionsWorld) {
  const expense = await this.getTransaction.execute({ userId: BRUNO, id: brunos(this).id });
  assert.equal(expense.id, brunos(this).id);
});

When(
  'filtro mis transacciones por la categoría de Bruno',
  async function (this: TransactionsWorld) {
    this.page = await this.list({ categoryId: brunos(this).categoryId });
  },
);

Then('no veo ninguna', function (this: TransactionsWorld) {
  assert.deepEqual(idsOf(this.page), []);
});

When('registro un gasto desde la web', async function (this: TransactionsWorld) {
  await this.attempt(() => this.create({ amount: '10.00', source: 'MANUAL' }));
});

Then(
  /^su origen (?:es|sigue siendo) "([A-Z_]+)"$/u,
  function (this: TransactionsWorld, source: string) {
    assert.equal(lastTransaction(this).source, source);
  },
);

// --- Todo se puede corregir, también en meses pasados, menos el origen --------------------------

async function correct(
  world: TransactionsWorld,
  changes: Parameters<TransactionsWorld['updateTransaction']['execute']>[0]['changes'],
) {
  const { id } = lastTransaction(world);
  await world.attempt(() => world.updateTransaction.execute({ userId: ANA, id, changes }));
}

Given(
  'que registré un gasto de {string} en agosto',
  async function (this: TransactionsWorld, text: string) {
    this.last = await this.create({ ...amountOf(text), date: '2026-08-15' });
  },
);

When('corrijo el monto a {string}', async function (this: TransactionsWorld, text: string) {
  await correct(this, { amount: amountOf(text).amount });
});

Given(
  'que registré un gasto variable en {string}',
  async function (this: TransactionsWorld, name: string) {
    this.last = await this.create({ amount: '30.00', categoryId: this.categoryId(ANA, name) });
  },
);

When('lo cambio a gasto fijo en {string}', async function (this: TransactionsWorld, name: string) {
  await correct(this, { type: 'FIXED_EXPENSE', categoryId: this.categoryId(ANA, name) });
});

Then('queda como gasto fijo en {string}', function (this: TransactionsWorld, name: string) {
  assertAccepted(this);
  assert.equal(lastTransaction(this).type, 'FIXED_EXPENSE');
  assert.equal(lastTransaction(this).categoryId, this.categoryId(ANA, name));
});

When(
  'intento cambiarlo a gasto fijo sin cambiar la categoría',
  async function (this: TransactionsWorld) {
    await correct(this, { type: 'FIXED_EXPENSE' });
  },
);

Then('se rechaza porque la categoría es de otro tipo', function (this: TransactionsWorld) {
  assertRejected(this, 'CATEGORY_TYPE_MISMATCH');
});

Given(
  'que registré un gasto de {string} con la cuenta {string}',
  async function (this: TransactionsWorld, text: string, alias: string) {
    this.last = await this.create({
      ...amountOf(text),
      paymentMethodId: this.methodId(ANA, alias),
    });
  },
);

When(
  'cambio el método de pago a la cuenta {string}',
  async function (this: TransactionsWorld, alias: string) {
    await correct(this, { paymentMethodId: this.methodId(ANA, alias) });
  },
);

Then('el gasto sigue en soles', function (this: TransactionsWorld) {
  assertAccepted(this);
  assert.equal(lastTransaction(this).amount.currency, 'PEN');
});

Given('que importé un gasto desde el CSV', async function (this: TransactionsWorld) {
  this.last = await this.create({ amount: '10.00', source: 'IMPORT' });
});

When('corrijo su descripción', async function (this: TransactionsWorld) {
  await correct(this, { description: 'Almuerzo con el equipo' });
});

Given('que registré un gasto en {string}', async function (this: TransactionsWorld, name: string) {
  const categoryId = this.addCategory(ANA, name, 'VARIABLE_EXPENSE');
  this.last = await this.create({ amount: '44.90', categoryId });
});

Given('después archivé la categoría {string}', function (this: TransactionsWorld, name: string) {
  this.archiveCategory(ANA, name, 'VARIABLE_EXPENSE');
});

When('corrijo su monto', async function (this: TransactionsWorld) {
  await correct(this, { amount: '49.90' });
});

// --- Borrar se puede deshacer ----------------------------------------------------------------------

Given('que registré un gasto', async function (this: TransactionsWorld) {
  this.last = await this.create({ amount: '25.90' });
});

async function removeLast(world: TransactionsWorld) {
  const expense = lastTransaction(world);
  world.remembered.set('deleted', expense);
  await world.deleteTransaction.execute({ userId: ANA, id: expense.id });
}

async function restoreLast(world: TransactionsWorld) {
  world.lastError = null;
  try {
    world.last = await world.restoreTransaction.execute({
      userId: ANA,
      id: lastTransaction(world).id,
    });
  } catch (error) {
    world.lastError = error;
  }
}

When('lo borro', async function (this: TransactionsWorld) {
  await removeLast(this);
});

Given('que borré un gasto', async function (this: TransactionsWorld) {
  this.last = await this.create({ amount: '25.90' });
  await removeLast(this);
});

Given('que borré un gasto y deshice el borrado', async function (this: TransactionsWorld) {
  this.last = await this.create({ amount: '25.90' });
  await removeLast(this);
  await restoreLast(this);
});

When(/^(?:deshago|vuelvo a deshacer) el borrado$/u, async function (this: TransactionsWorld) {
  await restoreLast(this);
});

Then('ya no aparece', async function (this: TransactionsWorld) {
  const { id } = lastTransaction(this);
  assert.ok(!idsOf(await this.list()).includes(id));
  await this.attempt(() => this.getTransaction.execute({ userId: ANA, id }));
  assertRejected(this, 'TRANSACTION_NOT_FOUND');
});

Then('sigue guardado para la auditoría', function (this: TransactionsWorld) {
  const deleted = this.remembered.get('deleted');
  const row = this.transactions.rows.find((candidate) => candidate.id === deleted?.id);
  assert.ok(row?.deletedAt instanceof Date, 'The deleted row is gone from storage.');
});

Then('vuelve a aparecer tal como estaba', async function (this: TransactionsWorld) {
  const before = this.remembered.get('deleted');
  assert.ok(before !== undefined);
  const after = await this.getTransaction.execute({ userId: ANA, id: before.id });
  assert.deepEqual(
    { ...after, amount: after.amount.toFixed(), date: after.date.toString(), updatedAt: null },
    { ...before, amount: before.amount.toFixed(), date: before.date.toString(), updatedAt: null },
  );
});

Then('el gasto sigue apareciendo una sola vez', async function (this: TransactionsWorld) {
  const { id } = lastTransaction(this);
  assert.equal(idsOf(await this.list()).filter((candidate) => candidate === id).length, 1);
});

// --- El listado encuentra lo registrado y suma lo filtrado ---------------------------------------

Given(
  'que registré un gasto el {fecha} y otro el {fecha}',
  async function (this: TransactionsWorld, first: string, second: string) {
    await this.create({ amount: '10.00', date: first, description: first });
    await this.create({ amount: '20.00', date: second, description: second });
  },
);

When('veo mis transacciones', async function (this: TransactionsWorld) {
  this.page = await this.list();
});

Then('la del {fecha} aparece primero', function (this: TransactionsWorld, date: string) {
  assert.ok(this.page !== null);
  assert.equal(this.page.items[0]?.date.toString(), date);
});

Given(
  'registré un gasto en {string} y otro en {string}',
  async function (this: TransactionsWorld, first: string, second: string) {
    await this.create({ amount: '10.00', categoryId: this.categoryId(ANA, first) });
    await this.create({ amount: '20.00', categoryId: this.categoryId(ANA, second) });
  },
);

When('filtro por {string}', async function (this: TransactionsWorld, name: string) {
  this.page = await this.list({ categoryId: this.categoryId(ANA, name) });
});

Then('veo los dos gastos', function (this: TransactionsWorld) {
  assert.equal(idsOf(this.page).length, 2);
});

Given(
  'que registré un gasto con la descripción {string}',
  async function (this: TransactionsWorld, description: string) {
    this.last = await this.create({ amount: '10.00', description });
  },
);

When('busco {string}', async function (this: TransactionsWorld, q: string) {
  this.page = await this.list({ q });
});

// Un grupo opcional que no coincide llega como `null`, no como `undefined`.
Then(/^(no )?lo encuentro$/u, function (this: TransactionsWorld, negated: string | null) {
  assert.equal(idsOf(this.page).includes(lastTransaction(this).id), negated === null);
});

Given(
  'que en septiembre tuve ingresos por {string} y gastos por {string}',
  async function (this: TransactionsWorld, income: string, expense: string) {
    await this.create({
      ...amountOf(income),
      type: 'INCOME',
      categoryId: this.categoryId(ANA, 'Sueldo'),
    });
    await this.create(amountOf(expense));
  },
);

Given('un gasto de {string}', async function (this: TransactionsWorld, text: string) {
  await this.create(amountOf(text));
});

When('veo septiembre de a una transacción por página', async function (this: TransactionsWorld) {
  this.page = await this.list({ month: '2026-09', limit: 1 });
});

Then(
  /^el saldo en (soles|dólares) es "([^"]+)"$/u,
  function (this: TransactionsWorld, name: string, text: string) {
    assert.ok(this.page !== null);
    assert.equal(this.page.items.length, 1, 'The page should have a single row.');
    const currency = name === 'soles' ? 'PEN' : 'USD';
    const totals = this.page.totals.find((total) => total.currency === currency);
    assert.ok(totals !== undefined);
    sameMoney(totals.balance, text);
  },
);

Given(
  'que tengo cuatro gastos y vi la primera página de dos',
  async function (this: TransactionsWorld) {
    for (const day of ['01', '02', '03', '04']) {
      const expense = await this.create({
        amount: '10.00',
        date: `2026-09-${day}`,
        description: day,
      });
      this.remembered.set(day, expense);
    }
    this.page = await this.list({ limit: 2 });
  },
);

When(
  'registro un gasto nuevo y borro uno de la primera página',
  async function (this: TransactionsWorld) {
    await this.create({ amount: '99.00', date: '2026-09-20', description: 'nuevo' });
    const [firstOfPage] = idsOf(this.page);
    assert.ok(firstOfPage !== undefined);
    await this.deleteTransaction.execute({ userId: ANA, id: firstOfPage });
  },
);

When('pido la página siguiente', async function (this: TransactionsWorld) {
  assert.ok(this.page?.next !== undefined && this.page.next !== null, 'There was no next page.');
  this.page = await this.list({ limit: 2, after: this.page.next });
});

Then('veo los dos gastos que faltaban, sin repetir ninguno', function (this: TransactionsWorld) {
  // Del más reciente al más viejo: la primera página fue 04 y 03; faltaban 02 y 01.
  assert.deepEqual(idsOf(this.page), [
    this.remembered.get('02')?.id,
    this.remembered.get('01')?.id,
  ]);
});

Then('no aparece', function (this: TransactionsWorld) {
  const deleted = this.remembered.get('deleted');
  assert.ok(deleted !== undefined);
  assert.ok(!idsOf(this.page).includes(deleted.id));
});
