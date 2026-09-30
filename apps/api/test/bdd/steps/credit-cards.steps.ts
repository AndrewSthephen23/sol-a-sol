import assert from 'node:assert/strict';

import { type DataTable, Given, Then, When } from '@cucumber/cucumber';
import {
  type CreditCardSettings,
  formatPercentage,
  LocalDate,
  Money,
  type PaymentDueRule,
} from '@sol-a-sol/domain';

import type { CreditCardStatusView } from '../../../src/modules/credit-cards/application/credit-card-status.js';
import { amountOf, describe, sameMoney } from '../support/readers.js';
import { ANA, BRUNO, type TransactionsWorld } from '../world.js';

// --- Configurar tarjetas -------------------------------------------------------------------------

function cardKey(userId: string, alias: string): string {
  return `card ${userId}/${alias}`;
}

function cardId(world: TransactionsWorld, userId: string, alias: string): string {
  const id = world.ids.get(cardKey(userId, alias));
  if (id === undefined) throw new Error(`The scenario never set up the card «${alias}».`);

  return id;
}

/** Una tarjeta bimoneda configurada con el caso de uso real, como desde la pantalla. */
async function setUpCard(
  world: TransactionsWorld,
  userId: string,
  alias: string,
  settings: CreditCardSettings,
): Promise<void> {
  const methodId = world.addCreditCard(userId, alias);
  const view = await world.configureCreditCard.execute(userId, methodId, settings);
  world.ids.set(cardKey(userId, alias), view.card.id);
}

function settingsOf(limit: string, statementDay: number, rule: PaymentDueRule): CreditCardSettings {
  const { amount, currency } = amountOf(limit);

  return {
    creditLimit: Money.of(amount, currency),
    statementDay,
    paymentDueRule: rule,
    openingBalance: null,
  };
}

Given(
  'que tengo la tarjeta {string} con una línea de {string}, corte el día {int} y pago {int} días después del corte',
  async function (
    this: TransactionsWorld,
    alias: string,
    limit: string,
    day: number,
    days: number,
  ) {
    await setUpCard(
      this,
      ANA,
      alias,
      settingsOf(limit, day, { kind: 'DAYS_AFTER_STATEMENT', days }),
    );
  },
);

Given(
  'que tengo la tarjeta {string} con una línea de {string}, corte el día {int} y pago el día {int} de cada mes',
  async function (this: TransactionsWorld, alias: string, limit: string, day: number, due: number) {
    await setUpCard(this, ANA, alias, settingsOf(limit, day, { kind: 'DAY_OF_MONTH', day: due }));
  },
);

Given(
  'que la {string} ya debía {string} el {fecha}',
  async function (this: TransactionsWorld, alias: string, text: string, date: string) {
    const { amount, currency } = amountOf(text);
    await this.updateCreditCard.execute(ANA, cardId(this, ANA, alias), {
      openingBalance: { date: LocalDate.parse(date), amounts: [Money.of(amount, currency)] },
    });
  },
);

// --- Lo que se mueve con la tarjeta: registrado como en la aplicación ------------------------------

async function buy(
  world: TransactionsWorld,
  userId: string,
  alias: string,
  text: string,
  date: string,
) {
  return world.create({
    ...amountOf(text),
    userId,
    date,
    paymentMethodId: world.methodId(userId, alias),
    categoryId: world.ensureCategory(userId, 'Comida', 'VARIABLE_EXPENSE'),
  });
}

Given(
  'que compré {string} con la {string} el {fecha}',
  async function (this: TransactionsWorld, text: string, alias: string, date: string) {
    await buy(this, ANA, alias, text, date);
  },
);

Given(
  'que compré y borré {string} con la {string} el {fecha}',
  async function (this: TransactionsWorld, text: string, alias: string, date: string) {
    const purchase = await buy(this, ANA, alias, text, date);
    await this.deleteTransaction.execute({ userId: ANA, id: purchase.id });
  },
);

Given(
  'que me devolvieron {string} a la {string} el {fecha}',
  async function (this: TransactionsWorld, text: string, alias: string, date: string) {
    await this.create({
      ...amountOf(text),
      date,
      type: 'INCOME',
      paymentMethodId: this.methodId(ANA, alias),
      categoryId: this.ensureCategory(ANA, 'Devoluciones', 'INCOME'),
    });
  },
);

Given(
  'que pagué {string} a la {string} desde {string} el {fecha}',
  async function (
    this: TransactionsWorld,
    text: string,
    alias: string,
    from: string,
    date: string,
  ) {
    const { amount, currency } = amountOf(text);
    await this.createTransfer.execute({
      userId: ANA,
      date,
      fromPaymentMethodId: this.methodId(ANA, from),
      toPaymentMethodId: this.methodId(ANA, alias),
      amount,
      currency,
      description: 'Pago de la tarjeta',
      source: 'MANUAL',
    });
  },
);

Given(
  'que pagué {string} a la {string} con {string} desde {string} el {fecha}',
  async function (
    this: TransactionsWorld,
    received: string,
    alias: string,
    sent: string,
    from: string,
    date: string,
  ) {
    const arrived = amountOf(received);
    const left = amountOf(sent);
    await this.createTransfer.execute({
      userId: ANA,
      date,
      fromPaymentMethodId: this.methodId(ANA, from),
      toPaymentMethodId: this.methodId(ANA, alias),
      amount: left.amount,
      currency: left.currency,
      receivedAmount: arrived.amount,
      receivedCurrency: arrived.currency,
      description: 'Pago de la tarjeta',
      source: 'MANUAL',
    });
  },
);

Given(
  'que saqué {string} de la {string} a {string} el {fecha}',
  async function (this: TransactionsWorld, text: string, alias: string, to: string, date: string) {
    const { amount, currency } = amountOf(text);
    await this.createTransfer.execute({
      userId: ANA,
      date,
      fromPaymentMethodId: this.methodId(ANA, alias),
      toPaymentMethodId: this.methodId(ANA, to),
      amount,
      currency,
      description: 'Disposición de efectivo',
      source: 'MANUAL',
    });
  },
);

// --- Cuotas ----------------------------------------------------------------------------------------

async function buyInInstallments(
  world: TransactionsWorld,
  text: string,
  alias: string,
  date: string,
  count: number,
  total: string | null,
): Promise<void> {
  const purchase = await buy(world, ANA, alias, text, date);
  world.installmentPlan = await world.createInstallmentPlan.execute(
    ANA,
    cardId(world, ANA, alias),
    {
      transactionId: purchase.id,
      count,
      totalAmount: total === null ? null : amountOf(total).amount,
    },
  );
}

Given(
  'que compré {string} con la {string} el {fecha} en {int} cuotas',
  async function (
    this: TransactionsWorld,
    text: string,
    alias: string,
    date: string,
    count: number,
  ) {
    await buyInInstallments(this, text, alias, date, count, null);
  },
);

Given(
  'que compré {string} con la {string} el {fecha} en {int} cuotas con un total de {string}',
  async function (
    this: TransactionsWorld,
    text: string,
    alias: string,
    date: string,
    count: number,
    total: string,
  ) {
    await buyInInstallments(this, text, alias, date, count, total);
  },
);

When(
  'compro {string} con la {string} el {fecha} en {int} cuotas',
  async function (
    this: TransactionsWorld,
    text: string,
    alias: string,
    date: string,
    count: number,
  ) {
    await buyInInstallments(this, text, alias, date, count, null);
  },
);

Then('las cuotas son:', function (this: TransactionsWorld, table: DataTable) {
  assert.ok(this.installmentPlan !== null, 'The scenario has not registered installments yet.');
  assert.deepEqual(
    this.installmentPlan.installments.map((installment) => [
      String(installment.number),
      installment.amount.toFixed(),
      installment.statementDate.toString(),
    ]),
    table
      .hashes()
      .map((row) => [
        row.cuota ?? '',
        amountOf(row.monto ?? '').amount,
        LocalDate.parseDayFirst(row['estado de cuenta'] ?? '').toString(),
      ]),
  );
});

// --- Ver la tarjeta --------------------------------------------------------------------------------

When('veo el estado de la {string}', async function (this: TransactionsWorld, alias: string) {
  this.cardStatus = await this.creditCardStatuses.one(ANA, cardId(this, ANA, alias));
});

function viewed(world: TransactionsWorld): CreditCardStatusView['status'] {
  assert.ok(world.cardStatus !== null, 'The scenario has not looked at a card yet.');

  return world.cardStatus.status;
}

function statementOf(world: TransactionsWorld) {
  const { statement } = viewed(world);
  assert.ok(statement !== null, 'The card has no closed statement.');

  return statement;
}

Then(
  'el ciclo actual va del {fecha} al {fecha}',
  function (this: TransactionsWorld, start: string, end: string) {
    const { cycle } = viewed(this);
    assert.deepEqual([cycle.start.toString(), cycle.end.toString()], [start, end]);
  },
);

Then(
  'la fecha límite de pago es el {fecha}, en {int} días',
  function (this: TransactionsWorld, date: string, days: number) {
    const statement = statementOf(this);
    assert.deepEqual([statement.dueDate.toString(), statement.daysLeft], [date, days]);
  },
);

Then('el último estado de cuenta es de {string}', function (this: TransactionsWorld, text: string) {
  const { currency } = amountOf(text);
  const balance = statementOf(this).balances.find((entry) => entry.balance.currency === currency);
  assert.ok(balance !== undefined, `The statement has nothing in ${currency}.`);
  sameMoney(balance.balance, text);
});

Then('el último estado de cuenta está pagado', function (this: TransactionsWorld) {
  assert.equal(statementOf(this).paid, true);
});

function currencyStatus(world: TransactionsWorld, text: string) {
  const { currency } = amountOf(text);
  const entry = viewed(world).currencies.find((candidate) => candidate.currency === currency);
  assert.ok(entry !== undefined, `The card shows nothing in ${currency}.`);

  return entry;
}

Then('debo {string}', function (this: TransactionsWorld, text: string) {
  sameMoney(currencyStatus(this, text).debt, text);
});

Then('el consumo del ciclo es {string}', function (this: TransactionsWorld, text: string) {
  sameMoney(currencyStatus(this, text).cycleCharges, text);
});

Then('faltan facturar {string} en cuotas', function (this: TransactionsWorld, text: string) {
  sameMoney(currencyStatus(this, text).pendingInstallments, text);
});

Then(/^uso el (\d+\.\d{2}) % de la línea$/u, function (this: TransactionsWorld, shown: string) {
  const { percentage } = viewed(this).utilization;
  assert.ok(percentage !== null, 'The card has no utilization percentage.');
  // Se muestra con 2 decimales; el nivel se decide sin redondear (ver el paso siguiente).
  assert.equal(formatPercentage(percentage.toString()), shown);
});

const LEVELS: Readonly<Record<string, string>> = {
  normal: 'OK',
  alto: 'HIGH',
  crítico: 'CRITICAL',
};

Then('el uso de la línea es {word}', function (this: TransactionsWorld, level: string) {
  assert.equal(viewed(this).utilization.level, LEVELS[level] ?? `unknown level «${level}»`);
});

Then('no hay porcentaje de uso de la línea', function (this: TransactionsWorld) {
  assert.deepEqual(viewed(this).utilization, { percentage: null, level: null });
});

/** Cómo lo diría la pantalla: «ninguno», «vence hoy», «vence en 3 días», «venció hace 1 día». */
function alertText(alert: CreditCardStatusView['status']['paymentAlert']): string {
  if (alert === null) return 'ninguno';
  if (alert.status === 'OVERDUE') {
    const days = -alert.daysLeft;

    return `venció hace ${String(days)} ${days === 1 ? 'día' : 'días'}`;
  }
  if (alert.daysLeft === 0) return 'vence hoy';

  return `vence en ${String(alert.daysLeft)} ${alert.daysLeft === 1 ? 'día' : 'días'}`;
}

Then('el aviso de pago es {string}', function (this: TransactionsWorld, expected: string) {
  assert.equal(alertText(viewed(this).paymentAlert), expected);
});

// --- Cada quien ve solo lo suyo --------------------------------------------------------------------

Given(
  'que Bruno tiene su tarjeta {string} configurada',
  async function (this: TransactionsWorld, alias: string) {
    await setUpCard(
      this,
      BRUNO,
      alias,
      settingsOf('S/ 1,000.00', 20, { kind: 'DAYS_AFTER_STATEMENT', days: 25 }),
    );
  },
);

Given(
  'que Bruno tiene su tarjeta {string} sin configurar',
  function (this: TransactionsWorld, alias: string) {
    this.addCreditCard(BRUNO, alias);
  },
);

Given(
  'que Bruno compró {string} con su {string} el {fecha}',
  async function (this: TransactionsWorld, text: string, alias: string, date: string) {
    await buy(this, BRUNO, alias, text, date);
  },
);

When('intento ver el estado de la tarjeta de Bruno', async function (this: TransactionsWorld) {
  this.lastError = null;
  try {
    this.cardStatus = await this.creditCardStatuses.one(ANA, cardId(this, BRUNO, 'Visa'));
  } catch (error) {
    this.lastError = error;
  }
});

When(
  'intento configurar la {string} de Bruno',
  async function (this: TransactionsWorld, alias: string) {
    this.lastError = null;
    try {
      await this.configureCreditCard.execute(
        ANA,
        this.methodId(BRUNO, alias),
        settingsOf('S/ 1,000.00', 20, { kind: 'DAYS_AFTER_STATEMENT', days: 25 }),
      );
    } catch (error) {
      this.lastError = error;
    }
  },
);

function assertRefused(world: TransactionsWorld, code: string): void {
  assert.equal(
    (world.lastError as { code?: string } | null)?.code,
    code,
    describe(world.lastError),
  );
}

Then('no se encuentra la tarjeta', function (this: TransactionsWorld) {
  assertRefused(this, 'CREDIT_CARD_NOT_FOUND');
});

Then('no se encuentra el método de pago', function (this: TransactionsWorld) {
  assertRefused(this, 'PAYMENT_METHOD_NOT_FOUND');
});
