import { describe, expect, it } from 'vitest';

import {
  checkContributionDraft,
  checkGoalDraft,
  contributionApiError,
  contributionBodyOf,
  contributionStateText,
  contributionText,
  emptyContribution,
  type Contribution,
  type Goal,
  goalApiError,
  goalDraftFor,
  goalPatchOf,
  periodText,
  progressBar,
  remainingText,
  removeErrorText,
  savedText,
  statusText,
  suggestedText,
} from './goal-model';

const TODAY = '2026-10-03';
const DRAFT = {
  name: ' Viaje a Cusco ',
  targetAmount: '1,200',
  currency: 'PEN' as const,
  startDate: '2026-01-01',
  endDate: '2026-12-31',
};

function goal(progress: Partial<Goal['progress']> = {}): Goal {
  return {
    id: 'goal-1',
    name: 'Viaje a Cusco',
    currency: 'PEN',
    targetAmount: '1200.00',
    startDate: '2026-01-01',
    endDate: '2026-12-31',
    archived: false,
    progress: {
      saved: '300.00',
      remaining: '900.00',
      excess: '0.00',
      percentage: '25',
      expectedPercentage: '74.794520547945205479',
      behind: '597.53',
      suggestedMonthly: '300.00',
      status: 'AT_RISK',
      ...progress,
    },
  };
}

function contribution(extra: Partial<Contribution> = {}): Contribution {
  return {
    id: 'c-1',
    source: 'MANUAL',
    kind: 'CONTRIBUTION',
    state: 'ACTIVE',
    amount: '300.00',
    date: '2026-09-15',
    transaction: null,
    ...extra,
  };
}

describe('goal draft', () => {
  it('starts a new goal today, without assuming a currency', () => {
    expect(goalDraftFor(null, TODAY)).toEqual({
      name: '',
      targetAmount: '',
      currency: null,
      startDate: TODAY,
      endDate: '',
    });
  });

  it('starts a correction with what the goal has', () => {
    expect(goalDraftFor(goal(), TODAY)).toEqual({
      ...DRAFT,
      name: 'Viaje a Cusco',
      targetAmount: '1200.00',
    });
  });

  it('builds the body, reading the amount with the domain rules', () => {
    expect(checkGoalDraft(DRAFT)).toEqual({
      body: {
        name: 'Viaje a Cusco',
        currency: 'PEN',
        targetAmount: '1200.00',
        startDate: '2026-01-01',
        endDate: '2026-12-31',
      },
    });
  });

  it('leaves the currency out of a correction: it stays fixed', () => {
    const checked = checkGoalDraft(DRAFT);
    if (!('body' in checked)) throw new Error('Expected a body');

    expect(goalPatchOf(checked.body)).not.toHaveProperty('currency');
  });

  it.each([
    ['an empty name', { name: '  ' }, 'name', 'Ponle un nombre a la meta.'],
    ['a name too long', { name: 'x'.repeat(61) }, 'name', 'El nombre tiene más de 60 letras.'],
    ['no currency', { currency: null }, 'currency', 'Elige la moneda de la meta.'],
    [
      'a target of zero',
      { targetAmount: '0' },
      'targetAmount',
      'El monto tiene que ser mayor que cero.',
    ],
    [
      'a target in dollars',
      { targetAmount: 'US$ 10' },
      'targetAmount',
      'El monto está en dólares, no en soles.',
    ],
    ['no start', { startDate: '' }, 'startDate', 'Elige desde cuándo ahorras.'],
    ['no end', { endDate: '' }, 'endDate', 'Elige para cuándo quieres llegar.'],
    [
      'an end on the start',
      { endDate: '2026-01-01' },
      'endDate',
      'La fecha final va después del inicio.',
    ],
  ])('says next to the field when there is %s', (_label, change, field, message) => {
    expect(checkGoalDraft({ ...DRAFT, ...change })).toEqual({ errors: { [field]: message } });
  });
});

describe('contribution draft', () => {
  it('builds a manual contribution in the goal currency', () => {
    const draft = { ...emptyContribution(TODAY), amount: '250.5' };

    expect(checkContributionDraft(draft, 'PEN', TODAY)).toEqual({
      body: { source: 'MANUAL', kind: 'CONTRIBUTION', amount: '250.50', date: TODAY },
    });
  });

  it('builds a withdrawal', () => {
    const draft = { ...emptyContribution(TODAY), kind: 'WITHDRAWAL' as const, amount: '10' };

    expect(checkContributionDraft(draft, 'PEN', TODAY)).toMatchObject({
      body: { kind: 'WITHDRAWAL', amount: '10.00' },
    });
  });

  it('links a chosen transaction', () => {
    const draft = {
      ...emptyContribution(TODAY),
      source: 'TRANSACTION' as const,
      transactionId: 't-1',
    };

    expect(checkContributionDraft(draft, 'PEN', TODAY)).toEqual({
      body: { source: 'TRANSACTION', transactionId: 't-1' },
    });
  });

  it.each([
    ['no amount', { amount: '' }, { amount: 'Escribe el monto.' }],
    [
      'three decimals',
      { amount: '1.001' },
      {
        amount: 'Escribe el monto con punto decimal y hasta 2 decimales, como 25.90.',
      },
    ],
    [
      'a date after today',
      { amount: '5', date: '2026-10-04' },
      {
        date: 'La fecha no puede ser posterior a hoy.',
      },
    ],
    ['no date', { amount: '5', date: '' }, { date: 'Elige la fecha.' }],
    [
      'no transaction chosen',
      { source: 'TRANSACTION' as const },
      {
        transactionId: 'Elige la transacción de ahorro.',
      },
    ],
  ])('says next to the field when there is %s', (_label, change, errors) => {
    expect(
      checkContributionDraft({ ...emptyContribution(TODAY), ...change }, 'PEN', TODAY),
    ).toEqual({
      errors,
    });
  });

  it('rebuilds a removed contribution to undo it', () => {
    expect(contributionBodyOf(contribution())).toEqual({
      source: 'MANUAL',
      kind: 'CONTRIBUTION',
      amount: '300.00',
      date: '2026-09-15',
    });
    expect(
      contributionBodyOf(
        contribution({ source: 'TRANSACTION', transaction: { id: 't-1', description: 'Ahorro' } }),
      ),
    ).toEqual({ source: 'TRANSACTION', transactionId: 't-1' });
  });

  it('cannot rebuild a link whose transaction was deleted', () => {
    expect(
      contributionBodyOf(
        contribution({ source: 'TRANSACTION', amount: null, date: null, transaction: null }),
      ),
    ).toBeNull();
  });
});

describe('API errors', () => {
  it.each([
    ['GOAL_NAME_TAKEN', 'name'],
    ['GOAL_TARGET_NOT_POSITIVE', 'targetAmount'],
    ['GOAL_END_NOT_AFTER_START', 'endDate'],
    ['GOAL_NOT_FOUND', null],
  ])('places %s of a goal next to %s', (code, field) => {
    expect(goalApiError(code)?.field).toBe(field);
  });

  it.each([
    ['GOAL_WITHDRAWAL_EXCEEDS_SAVED', 'amount'],
    ['GOAL_CONTRIBUTION_DATE_IN_FUTURE', 'date'],
    ['GOAL_TRANSACTION_ALREADY_LINKED', 'transactionId'],
    ['GOAL_CURRENCY_MISMATCH', 'transactionId'],
    ['GOAL_ARCHIVED', null],
  ])('places %s of a contribution next to %s', (code, field) => {
    expect(contributionApiError(code)?.field).toBe(field);
  });

  it('knows nothing of unknown or missing codes', () => {
    expect(goalApiError('SOMETHING_ELSE')).toBeNull();
    expect(goalApiError(null)).toBeNull();
    expect(contributionApiError(null)).toBeNull();
  });

  it('explains why a contribution cannot be removed', () => {
    expect(removeErrorText('GOAL_WITHDRAWAL_EXCEEDS_SAVED')).toMatch(/tus retiros/u);
    expect(removeErrorText(null)).toBe('No se pudo quitar el aporte. Inténtalo de nuevo.');
  });
});

describe('how a goal goes, in words', () => {
  it('says how much was saved, with the percentage in two decimals', () => {
    expect(savedText(goal({ percentage: '8.333333333' }))).toBe(
      'Llevas S/ 300.00 de S/ 1,200.00 (8.33 %)',
    );
  });

  it.each([
    [{}, 'Te faltan S/ 900.00'],
    [{ remaining: '0.00' }, 'Llegaste a la meta'],
    [{ remaining: '0.00', excess: '300.00' }, 'Superaste la meta por S/ 300.00'],
  ])('says what is left: %o', (progress, text) => {
    expect(remainingText(goal(progress))).toBe(text);
  });

  it.each([
    ['ON_TRACK', 'Vas bien'],
    ['AT_RISK', 'En riesgo: te faltan S/ 597.53 para ir al día'],
    ['ACHIEVED', '¡Cumplida!'],
    ['OVERDUE', 'Vencida: faltaron S/ 900.00'],
  ] as const)('says %s as «%s»', (status, text) => {
    expect(statusText(goal({ status }))).toBe(text);
  });

  it.each([
    [{}, 'Aporta S/ 300.00 al mes para llegar a tiempo'],
    [{ suggestedMonthly: '0.00' }, null],
    [{ suggestedMonthly: null }, 'La fecha final ya pasó: no hay aporte sugerido.'],
  ])('suggests a monthly contribution: %o', (progress, text) => {
    expect(suggestedText(goal(progress))).toBe(text);
  });

  it('says the period with its years', () => {
    expect(periodText(goal())).toBe('Del 1 de enero de 2026 al 31 de diciembre de 2026');
  });

  it.each([
    ['25', 25],
    ['125', 100],
    ['-8.3', 0],
  ])('fills the bar with %s %% up to %s', (percentage, filled) => {
    expect(progressBar(percentage)).toBe(filled);
  });

  it('describes a contribution, a withdrawal and a link', () => {
    expect(contributionText(contribution(), 'PEN')).toBe('Aporte de S/ 300.00 el 15 de setiembre');
    expect(contributionText(contribution({ kind: 'WITHDRAWAL', amount: '50.00' }), 'PEN')).toBe(
      'Retiro de S/ 50.00 el 15 de setiembre',
    );
    expect(
      contributionText(
        contribution({ source: 'TRANSACTION', transaction: { id: 't', description: 'Ahorro' } }),
        'PEN',
      ),
    ).toBe('Aporte de S/ 300.00 el 15 de setiembre · Ahorro');
  });

  it('says why a link does not count', () => {
    expect(contributionStateText(contribution())).toBeNull();
    expect(contributionStateText(contribution({ state: 'TRANSACTION_DELETED' }))).toBe(
      'No cuenta: la transacción se borró',
    );
  });
});
