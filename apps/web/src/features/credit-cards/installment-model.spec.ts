import { describe, expect, it } from 'vitest';

import {
  badgeText,
  checkInstallments,
  type InstallmentDraft,
  installmentErrorMessage,
  type InstallmentPlan,
  NO_INSTALLMENTS,
  planLines,
  previewText,
} from './installment-model';

const PURCHASE = { amount: '100.00', currency: 'PEN' as const, date: '2026-09-10' };

function draft(extra: Partial<InstallmentDraft>): InstallmentDraft {
  return { enabled: true, count: '3', total: '', ...extra };
}

function plan(extra: Partial<InstallmentPlan> = {}): InstallmentPlan {
  return {
    id: 'plan-1',
    transactionId: 'tx-1',
    count: 3,
    state: 'ACTIVE',
    purchase: {
      date: '2026-09-10',
      description: 'Televisor',
      amount: { amount: '1200.00', currency: 'PEN' },
    },
    total: { amount: '1260.00', currency: 'PEN' },
    interest: { amount: '60.00', currency: 'PEN' },
    installments: [
      {
        number: 1,
        amount: { amount: '420.00', currency: 'PEN' },
        statementDate: '2026-09-20',
        billed: true,
      },
      {
        number: 2,
        amount: { amount: '420.00', currency: 'PEN' },
        statementDate: '2026-10-20',
        billed: false,
      },
      {
        number: 3,
        amount: { amount: '420.00', currency: 'PEN' },
        statementDate: '2026-11-20',
        billed: false,
      },
    ],
    pending: { count: 2, amount: { amount: '840.00', currency: 'PEN' } },
    ...extra,
  };
}

describe('checkInstallments', () => {
  it('is off unless asked for', () => {
    expect(checkInstallments(NO_INSTALLMENTS, PURCHASE, 20)).toEqual({ kind: 'off' });
  });

  it('splits with the domain, the extra cents to the first ones, and builds the body', () => {
    const checked = checkInstallments(draft({}), PURCHASE, 20);

    expect(checked.kind).toBe('ready');
    if (checked.kind !== 'ready') return;
    expect(checked.body).toEqual({ count: 3, totalAmount: null });
    expect(checked.installments.map((item) => item.amount.toFixed())).toEqual([
      '33.34',
      '33.33',
      '33.33',
    ]);
    expect(checked.installments[0]?.statementDate.toString()).toBe('2026-09-20');
  });

  it('sends the bank total when there is interest', () => {
    const checked = checkInstallments(
      draft({ total: '1,260' }),
      { ...PURCHASE, amount: '1200' },
      20,
    );

    expect(checked).toMatchObject({ kind: 'ready', body: { count: 3, totalAmount: '1260.00' } });
  });

  it('waits for the purchase before splitting it', () => {
    expect(checkInstallments(draft({}), { ...PURCHASE, amount: '' }, 20)).toEqual({
      kind: 'waiting',
    });
    expect(checkInstallments(draft({}), { ...PURCHASE, currency: null }, 20)).toEqual({
      kind: 'waiting',
    });
    expect(checkInstallments(draft({}), { ...PURCHASE, date: '' }, 20)).toEqual({
      kind: 'waiting',
    });
  });

  it.each([
    ['1 installment', { count: '1' }, PURCHASE, 'Las cuotas van de 2 a 36.'],
    ['37 installments', { count: '37' }, PURCHASE, 'Las cuotas van de 2 a 36.'],
    ['a count that is not a number', { count: 'seis' }, PURCHASE, 'Las cuotas van de 2 a 36.'],
    [
      'a total below the price',
      { total: '99.99' },
      PURCHASE,
      'El total en cuotas no puede ser menor que el precio.',
    ],
    [
      'a total with three decimals',
      { total: '100.001' },
      PURCHASE,
      'Escribe el total con punto decimal y hasta 2 decimales.',
    ],
    [
      'a purchase too small',
      {},
      { ...PURCHASE, amount: '0.02' },
      'El monto es muy pequeño para tantas cuotas.',
    ],
  ])('says what is wrong with %s', (_case, extra, purchase, message) => {
    expect(checkInstallments(draft(extra), purchase, 20)).toEqual({ kind: 'error', message });
  });
});

describe('previewText', () => {
  it('groups equal amounts and says where the first one goes', () => {
    const checked = checkInstallments(draft({}), PURCHASE, 20);

    expect(checked.kind === 'ready' && previewText(checked.installments)).toBe(
      '3 cuotas: 1 de S/ 33.34 y 2 de S/ 33.33. La primera va en el estado del 20 de setiembre.',
    );
  });

  it('says a single amount once', () => {
    const checked = checkInstallments(draft({ count: '4' }), PURCHASE, 20);

    expect(checked.kind === 'ready' && previewText(checked.installments)).toBe(
      '4 cuotas: 4 de S/ 25.00. La primera va en el estado del 20 de setiembre.',
    );
  });

  it('is empty without installments', () => {
    expect(previewText([])).toBe('');
  });
});

describe('planLines and badgeText', () => {
  it('says what was billed, the next one, what is left and the interest', () => {
    expect(planLines(plan())).toEqual([
      '1 de 3 cuotas facturadas',
      'Próxima cuota: S/ 420.00 en el estado del 20 de octubre',
      'Faltan S/ 840.00',
      'Intereses: S/ 60.00',
    ]);
    expect(badgeText(plan())).toBe('1 de 3 cuotas');
  });

  it('says a finished plan has nothing left, and leaves out zero interest', () => {
    const done = plan({
      installments: plan().installments.map((item) => ({ ...item, billed: true })),
      pending: null,
      interest: { amount: '0.00', currency: 'PEN' },
    });

    expect(planLines(done)).toEqual(['3 de 3 cuotas facturadas']);
    expect(badgeText(done)).toBe('3 de 3 cuotas');
  });

  it.each([
    ['PURCHASE_DELETED', /borrada/u],
    ['PURCHASE_NOT_ON_CARD', /ya no es de esta tarjeta/u],
    ['PURCHASE_NOT_A_CHARGE', /ingreso/u],
    ['TOTAL_BELOW_PRICE', /supera el total/u],
  ])('explains a %s plan, and shows no badge for it', (state, text) => {
    const invalid = plan({ state: state as InstallmentPlan['state'] });

    expect(planLines(invalid)).toEqual([expect.stringMatching(text) as string]);
    expect(badgeText(invalid)).toBeNull();
  });
});

describe('installmentErrorMessage', () => {
  it('translates the API codes, and falls back to a generic message', () => {
    expect(installmentErrorMessage('INSTALLMENT_PLAN_ALREADY_EXISTS')).toBe(
      'Esta compra ya se paga en cuotas.',
    );
    expect(installmentErrorMessage('SOMETHING_ELSE')).toBe('No se pudieron guardar las cuotas.');
    expect(installmentErrorMessage(null)).toBe('No se pudieron guardar las cuotas.');
  });
});
