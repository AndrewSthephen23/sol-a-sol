import assert from 'node:assert/strict';

import { defineParameterType, Given, Then, When } from '@cucumber/cucumber';
import { LocalDate } from '@sol-a-sol/domain';

import type { CaptureRequestBody } from '../../../src/modules/capture/application/receive-capture.js';
import type { Capture } from '../../../src/modules/capture/ports/capture-repository.js';
import { amountOf, describe } from '../support/readers.js';
import { ANA, BRUNO, type TransactionsWorld } from '../world.js';

/** `11:30`: una hora del día, en Lima. */
defineParameterType({ name: 'hora', regexp: /\d{2}:\d{2}/, transformer: (text: string) => text });

/** Las 11:30 del 03/10/2026 en Lima, como lo manda el teléfono: con su zona. */
function limaInstant(time: string, day: string): string {
  return `${day}T${time}:00-05:00`;
}

/** Lo que llega del teléfono pasa por `POST /captures`: aquí, por su caso de uso. */
async function receive(world: TransactionsWorld, body: CaptureRequestBody, key?: string) {
  const { capture } = await world.receiveCapture.execute(ANA, body, key);
  world.capture = capture;
}

function theCapture(world: TransactionsWorld): Capture {
  if (world.capture === null) throw new Error('The scenario never received a capture.');

  return world.capture;
}

/** La captura como está ahora en la bandeja: una regla o una corrección la cambian por detrás. */
async function current(world: TransactionsWorld): Promise<Capture> {
  const found = await world.captures.find(ANA, theCapture(world).id);
  if (found === null) throw new Error('The capture is gone.');
  world.capture = found;

  return found;
}

// --- Lo que llega del teléfono -------------------------------------------------------------------

Given(
  '(que )llega del iPhone un gasto de {string} en {string} a las {hora} del {fecha}',
  async function (
    this: TransactionsWorld,
    amountText: string,
    merchant: string,
    time: string,
    day: string,
  ) {
    await receive(this, {
      source: 'IOS_SHORTCUT',
      occurredAt: limaInstant(time, day),
      amountText,
      merchant,
    });
  },
);

When(
  'llega del iPhone un gasto de {string} en {string} a las {hora} del {fecha} con la clave {string}',
  async function (
    this: TransactionsWorld,
    amountText: string,
    merchant: string,
    time: string,
    day: string,
    key: string,
  ) {
    await receive(
      this,
      { source: 'IOS_SHORTCUT', occurredAt: limaInstant(time, day), amountText, merchant },
      key,
    );
  },
);

When(
  'llega del iPhone un gasto de {string} en {string} con la tarjeta {string} a las {hora} del {fecha}',
  async function (
    this: TransactionsWorld,
    amountText: string,
    merchant: string,
    card: string,
    time: string,
    day: string,
  ) {
    await receive(this, {
      source: 'IOS_SHORTCUT',
      occurredAt: limaInstant(time, day),
      amountText,
      merchant,
      card,
    });
  },
);

Given(
  '(que )llega de Android la notificación {string} a las {hora} del {fecha}',
  async function (this: TransactionsWorld, rawText: string, time: string, day: string) {
    await receive(this, {
      source: 'ANDROID_AUTOMATION',
      occurredAt: limaInstant(time, day),
      rawText,
    });
  },
);

// --- Lo que ya hay -------------------------------------------------------------------------------

Given(
  '(que )tengo la regla {string} para {string}',
  async function (this: TransactionsWorld, pattern: string, category: string) {
    await createRule(this, pattern, category, 0);
  },
);

Given(
  'que tengo la regla {string} para {string} con prioridad {int}',
  async function (this: TransactionsWorld, pattern: string, category: string, priority: number) {
    await createRule(this, pattern, category, priority);
  },
);

When(
  'creo la regla {string} para {string}',
  async function (this: TransactionsWorld, pattern: string, category: string) {
    await createRule(this, pattern, category, 0);
  },
);

async function createRule(
  world: TransactionsWorld,
  pattern: string,
  category: string,
  priority: number,
): Promise<void> {
  // Una categoría que el escenario no conoce todavía es de gasto variable, como «Antojos».
  const categoryId = world.ensureCategory(ANA, category, 'VARIABLE_EXPENSE');
  await world.createRule.execute(ANA, { pattern, categoryId, priority });
}

Given(
  'que tengo la tarjeta {string} terminada en {string} en soles',
  function (this: TransactionsWorld, alias: string, last4: string) {
    this.addPaymentMethod(ANA, alias, 'PEN', false, last4);
  },
);

Given(
  'que registré a mano {string} en {string} el {fecha}',
  async function (this: TransactionsWorld, text: string, merchant: string, date: string) {
    await this.attempt(() =>
      this.create({ ...amountOf(text), date, merchant, description: merchant }),
    );
    assert.equal(this.lastError, null, describe(this.lastError));
  },
);

// --- Revisar la bandeja --------------------------------------------------------------------------

Given(
  '(que )corrijo la captura con la categoría {string}',
  async function (this: TransactionsWorld, category: string) {
    this.capture = await this.correctCapture.execute(ANA, theCapture(this).id, {
      categoryId: this.categoryId(ANA, category),
    });
  },
);

When('cambio la captura a ingreso', async function (this: TransactionsWorld) {
  this.capture = await this.correctCapture.execute(ANA, theCapture(this).id, { type: 'INCOME' });
});

Given('(que )confirmo la captura', async function (this: TransactionsWorld) {
  this.capture = await this.confirmCapture.execute(ANA, theCapture(this).id, {
    rememberCategory: false,
  });
});

When('confirmo la captura recordando la categoría', async function (this: TransactionsWorld) {
  this.capture = await this.confirmCapture.execute(ANA, theCapture(this).id, {
    rememberCategory: true,
  });
});

async function attemptConfirm(world: TransactionsWorld, userId: string): Promise<void> {
  world.lastError = null;
  try {
    await world.confirmCapture.execute(userId, theCapture(world).id, { rememberCategory: false });
  } catch (error) {
    world.lastError = error;
  }
}

When('intento confirmar la captura', async function (this: TransactionsWorld) {
  await attemptConfirm(this, ANA);
});

When('Bruno intenta confirmar la captura', async function (this: TransactionsWorld) {
  await attemptConfirm(this, BRUNO);
});

When('descarto la captura', async function (this: TransactionsWorld) {
  this.capture = await this.discardCapture.execute(ANA, theCapture(this).id);
});

When('deshago el descarte', async function (this: TransactionsWorld) {
  this.capture = await this.restoreCapture.execute(ANA, theCapture(this).id);
});

// --- Lo que se ve --------------------------------------------------------------------------------

async function inboxOf(world: TransactionsWorld, userId: string): Promise<Capture[]> {
  const page = await world.listCaptures.execute(userId, {
    status: 'inbox',
    after: null,
    limit: 50,
  });

  return page.captures;
}

Then('la bandeja tiene {int} captura(s)', async function (this: TransactionsWorld, count: number) {
  assert.equal((await inboxOf(this, ANA)).length, count);
});

Then('la bandeja de Bruno está vacía', async function (this: TransactionsWorld) {
  assert.deepEqual(await inboxOf(this, BRUNO), []);
});

Then(
  'la captura es de {string} en {string} del {fecha}',
  async function (this: TransactionsWorld, text: string, merchant: string, date: string) {
    const capture = await current(this);
    const { amount, currency } = amountOf(text);
    assert.deepEqual(capture.amount, { value: amount, currency });
    assert.equal(capture.merchant, merchant);
    assert.equal(capture.businessDate.toString(), LocalDate.parse(date).toString());
  },
);

Then('la captura no tiene monto', async function (this: TransactionsWorld) {
  assert.equal((await current(this)).amount, null);
});

Then('la captura avisa {string}', async function (this: TransactionsWorld, warning: string) {
  assert.ok((await current(this)).warnings.includes(warning), String(this.capture?.warnings));
});

Then('la captura no avisa nada', async function (this: TransactionsWorld) {
  assert.deepEqual((await current(this)).warnings, []);
});

Then('la captura está marcada como duplicada', async function (this: TransactionsWorld) {
  assert.equal((await current(this)).status, 'DUPLICATE');
});

Then('la captura no está marcada como duplicada', async function (this: TransactionsWorld) {
  assert.equal((await current(this)).status, 'PENDING');
});

Then(
  'la captura sugiere la categoría {string}',
  async function (this: TransactionsWorld, category: string) {
    assert.equal((await current(this)).categoryId, this.categoryId(ANA, category));
  },
);

Then('la captura no sugiere categoría', async function (this: TransactionsWorld) {
  assert.equal((await current(this)).categoryId, null);
});

Then(
  'la captura reconoce el método {string}',
  async function (this: TransactionsWorld, alias: string) {
    assert.equal((await current(this)).paymentMethodId, this.methodId(ANA, alias));
  },
);

Then(
  'lo guardado de la captura no tiene el número de la tarjeta',
  async function (this: TransactionsWorld) {
    assert.doesNotMatch(JSON.stringify((await current(this)).rawPayload), /4111/u);
  },
);

Then('la captura ya no tiene lo que llegó del teléfono', async function (this: TransactionsWorld) {
  assert.equal((await current(this)).rawPayload, null);
});

function transactionsOf(world: TransactionsWorld) {
  const id = theCapture(world).id;

  return world.transactions.rows.filter((row) => row.captureId === id);
}

Then(
  'se registra un gasto de {string} desde el iPhone con su captura',
  function (this: TransactionsWorld, text: string) {
    const [transaction] = transactionsOf(this);
    assert.ok(transaction !== undefined, 'The capture has no transaction.');
    const { amount, currency } = amountOf(text);
    assert.equal(
      `${transaction.amount.currency} ${transaction.amount.toFixed()}`,
      `${currency} ${amount}`,
    );
    assert.equal(transaction.type, 'VARIABLE_EXPENSE');
    assert.equal(transaction.source, 'IOS_SHORTCUT');
    assert.equal(theCapture(this).status, 'CONFIRMED');
  },
);

Then('la captura tiene {int} transacción(es)', function (this: TransactionsWorld, count: number) {
  assert.equal(transactionsOf(this).length, count);
});
