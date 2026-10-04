import { describe, expect, it } from 'vitest';

import {
  type CategorizationRuleCandidate,
  matchPaymentMethod,
  type PaymentMethodCandidate,
  resolveCaptureCurrency,
  suggestCategory,
} from './capture-matching.js';

function method(extra: Partial<PaymentMethodCandidate> & { id: string }): PaymentMethodCandidate {
  return { alias: extra.id, last4: null, archived: false, ...extra };
}

describe('matchPaymentMethod (decision 4)', () => {
  const visa = method({ id: 'visa', alias: 'Visa BCP', last4: '4242' });
  const account = method({ id: 'cuenta', alias: 'Cuenta Sueldo', last4: '1111' });
  const yape = method({ id: 'yape', alias: 'Yápe' });

  it('recognizes the only method with those last 4', () => {
    expect(matchPaymentMethod([account, visa, yape], '4242', null)).toBe('visa');
  });

  it('recognizes the alias, ignoring accents and case, when there are no last 4', () => {
    expect(matchPaymentMethod([visa, yape], null, ' YAPE ')).toBe('yape');
  });

  it('does not take an alias that only contains the text', () => {
    expect(matchPaymentMethod([visa], null, 'BCP')).toBeNull();
  });

  it('tries the alias when no method has those last 4', () => {
    expect(matchPaymentMethod([visa, yape], '9999', 'Yape')).toBe('yape');
  });

  it('tries the alias when two methods share the last 4', () => {
    const other = method({ id: 'mastercard', alias: 'Mastercard', last4: '4242' });

    expect(matchPaymentMethod([visa, other], '4242', 'Mastercard')).toBe('mastercard');
  });

  it('chooses none when two methods share the last 4 and nothing else tells them apart', () => {
    const other = method({ id: 'mastercard', alias: 'Mastercard', last4: '4242' });

    expect(matchPaymentMethod([visa, other], '4242', null)).toBeNull();
  });

  it('chooses none without last 4 or card text, not even the only method without last 4', () => {
    expect(matchPaymentMethod([visa, yape], null, null)).toBeNull();
  });

  it('chooses none when two aliases are the same without accents', () => {
    const plain = method({ id: 'yape-2', alias: 'Yape' });

    expect(matchPaymentMethod([yape, plain], null, 'yape')).toBeNull();
  });

  it('skips archived methods, so a cancelled card with the same last 4 does not get in the way', () => {
    const cancelled = method({ id: 'vieja', alias: 'Visa vieja', last4: '4242', archived: true });

    expect(matchPaymentMethod([cancelled, visa], '4242', null)).toBe('visa');
    expect(matchPaymentMethod([cancelled], null, 'Visa vieja')).toBeNull();
  });
});

describe('resolveCaptureCurrency (decision 3)', () => {
  it('keeps the currency the amount says', () => {
    expect(resolveCaptureCurrency({ value: '20.00', currency: 'USD' }, null)).toEqual({
      currency: 'USD',
      warnings: [],
    });
  });

  it('takes the currency of the payment method when the amount says none', () => {
    expect(resolveCaptureCurrency({ value: '20.00', currency: null }, 'PEN')).toEqual({
      currency: 'PEN',
      warnings: [],
    });
  });

  it('leaves no currency with a two-currency method or none: it is chosen in the inbox', () => {
    expect(resolveCaptureCurrency({ value: '20.00', currency: null }, null)).toEqual({
      currency: null,
      warnings: [],
    });
  });

  it('keeps the currency of the text and warns when the method has another one', () => {
    expect(resolveCaptureCurrency({ value: '20.00', currency: 'USD' }, 'PEN')).toEqual({
      currency: 'USD',
      warnings: ['CURRENCY_MISMATCH'],
    });
  });

  it('does not warn when they agree', () => {
    expect(resolveCaptureCurrency({ value: '20.00', currency: 'PEN' }, 'PEN').warnings).toEqual([]);
  });

  it('takes the currency of the method even without an amount', () => {
    expect(resolveCaptureCurrency(null, 'PEN')).toEqual({ currency: 'PEN', warnings: [] });
  });
});

describe('suggestCategory (decision 12)', () => {
  function rule(extra: Partial<CategorizationRuleCandidate>): CategorizationRuleCandidate {
    return {
      categoryId: 'viveres',
      categoryType: 'VARIABLE_EXPENSE',
      categoryArchived: false,
      patternKey: 'tambo',
      priority: 0,
      ...extra,
    };
  }

  it('suggests the category of the rule whose pattern the merchant contains', () => {
    expect(suggestCategory([rule({})], 'VARIABLE_EXPENSE', 'TAMBÓ Larco', null)).toBe('viveres');
  });

  it('compares against the text of the notification when there is no merchant', () => {
    expect(
      suggestCategory([rule({})], 'VARIABLE_EXPENSE', null, 'Compra en Tambo por S/ 5.00'),
    ).toBe('viveres');
  });

  it('does not look at the text when there is a merchant', () => {
    expect(suggestCategory([rule({})], 'VARIABLE_EXPENSE', 'Wong', 'Compra en Tambo')).toBeNull();
  });

  it('suggests nothing with neither merchant nor text', () => {
    expect(suggestCategory([rule({})], 'VARIABLE_EXPENSE', null, null)).toBeNull();
  });

  it('suggests nothing when no rule applies', () => {
    expect(suggestCategory([rule({})], 'VARIABLE_EXPENSE', 'Wong', null)).toBeNull();
  });

  it('lets the highest priority win', () => {
    const rules = [
      rule({ categoryId: 'baja', patternKey: 'tambo larco', priority: 1 }),
      rule({ categoryId: 'alta', patternKey: 'tambo', priority: 5 }),
    ];

    expect(suggestCategory(rules, 'VARIABLE_EXPENSE', 'Tambo Larco', null)).toBe('alta');
  });

  it('breaks a tie in priority with the longest pattern', () => {
    const rules = [
      rule({ categoryId: 'corta', patternKey: 'tambo' }),
      rule({ categoryId: 'larga', patternKey: 'tambo larco' }),
    ];

    expect(suggestCategory(rules, 'VARIABLE_EXPENSE', 'Tambo Larco', null)).toBe('larga');
  });

  it('breaks a full tie by pattern, so the answer does not depend on the order', () => {
    const rules = [
      rule({ categoryId: 'por-tambo', patternKey: 'tambo' }),
      rule({ categoryId: 'por-larco', patternKey: 'larco' }),
    ];

    expect(suggestCategory(rules, 'VARIABLE_EXPENSE', 'Tambo Larco', null)).toBe('por-larco');
    expect(suggestCategory(rules.toReversed(), 'VARIABLE_EXPENSE', 'Tambo Larco', null)).toBe(
      'por-larco',
    );
  });

  it('skips the rules whose category is of another type (decided 2026-10-04)', () => {
    const rules = [
      rule({ categoryId: 'honorarios', categoryType: 'INCOME', priority: 9 }),
      rule({ categoryId: 'viveres' }),
    ];

    expect(suggestCategory(rules, 'VARIABLE_EXPENSE', 'Tambo', null)).toBe('viveres');
    expect(suggestCategory(rules, 'INCOME', 'Tambo', null)).toBe('honorarios');
  });

  it('skips the rules whose category is archived', () => {
    expect(
      suggestCategory([rule({ categoryArchived: true })], 'VARIABLE_EXPENSE', 'Tambo', null),
    ).toBeNull();
  });
});
