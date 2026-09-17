import { describe, expect, it } from 'vitest';

import { InvalidModuleNameError, moduleNames } from './naming.js';

describe('moduleNames', () => {
  it.each([
    ['budgeting', 'FEATURE_BUDGETING', 'Budgeting', 'budgetingManifest'],
    ['credit-cards', 'FEATURE_CREDIT_CARDS', 'CreditCards', 'creditCardsManifest'],
    ['investments-us', 'FEATURE_INVESTMENTS_US', 'InvestmentsUs', 'investmentsUsManifest'],
  ])('derives the names of %s', (name, envVar, className, manifestName) => {
    const names = moduleNames(name);

    expect(names).toMatchObject({ name, envVar, className, manifestName });
  });

  it('suggests a title from the name when none is given', () => {
    expect(moduleNames('credit-cards').defaultTitle).toBe('Credit cards');
  });

  it.each([
    ['uppercase', 'Budgeting'],
    ['snake_case', 'credit_cards'],
    ['spaces', 'credit cards'],
    ['a leading dash', '-budgeting'],
    ['a trailing dash', 'budgeting-'],
    ['double dashes', 'credit--cards'],
    ['digits at the start', '2budgeting'],
    ['a path traversal', '../secrets'],
    ['a slash', 'budgeting/sub'],
    ['empty', ''],
    ['too long', 'a'.repeat(41)],
  ])('rejects %s', (_description, name) => {
    expect(() => moduleNames(name)).toThrow(InvalidModuleNameError);
  });

  it('explains what a valid name looks like', () => {
    expect(() => moduleNames('Budgeting')).toThrow(/kebab-case/u);
  });
});
