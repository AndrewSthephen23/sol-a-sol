import { afterEach, describe, expect, it } from 'vitest';

import {
  FEATURE_MODULES,
  FeatureFlagsService,
  featureEnvVar,
  isFeatureEnabled,
} from './feature-flags.js';

describe('featureEnvVar', () => {
  it.each([
    ['transactions', 'FEATURE_TRANSACTIONS'],
    ['credit-cards', 'FEATURE_CREDIT_CARDS'],
    ['capture', 'FEATURE_CAPTURE'],
  ] as const)('maps %s to %s', (module, expected) => {
    expect(featureEnvVar(module)).toBe(expected);
  });

  it('covers every phase 1 module', () => {
    expect(FEATURE_MODULES).toEqual([
      'identity',
      'catalog',
      'transactions',
      'budgeting',
      'credit-cards',
      'goals',
      'reports',
      'capture',
    ]);
  });
});

describe('isFeatureEnabled', () => {
  it('enables a module only when its variable is exactly "true"', () => {
    expect(isFeatureEnabled({ FEATURE_BUDGETING: 'true' }, 'budgeting')).toBe(true);
  });

  it.each([
    ['missing', undefined],
    ['empty', ''],
    ['false', 'false'],
    ['uppercase TRUE', 'TRUE'],
    ['1', '1'],
    ['yes', 'yes'],
    ['padded', ' true '],
  ])('keeps the module disabled when the variable is %s', (_description, value) => {
    expect(isFeatureEnabled({ FEATURE_BUDGETING: value }, 'budgeting')).toBe(false);
  });

  it('reads one variable per module', () => {
    const env = { FEATURE_BUDGETING: 'true' };

    expect(isFeatureEnabled(env, 'budgeting')).toBe(true);
    expect(isFeatureEnabled(env, 'transactions')).toBe(false);
  });
});

describe('FeatureFlagsService', () => {
  const service = new FeatureFlagsService();

  afterEach(() => {
    delete process.env.FEATURE_BUDGETING;
    delete process.env.FEATURE_GOALS;
  });

  it('reads the environment when it is asked, not when it is created', () => {
    expect(service.isEnabled('budgeting')).toBe(false);

    process.env.FEATURE_BUDGETING = 'true';

    expect(service.isEnabled('budgeting')).toBe(true);
  });

  it('lists the enabled modules', () => {
    process.env.FEATURE_BUDGETING = 'true';
    process.env.FEATURE_GOALS = 'true';

    expect(service.enabledModules()).toEqual(['budgeting', 'goals']);
  });

  it('lists nothing when every module is disabled', () => {
    expect(service.enabledModules()).toEqual([]);
  });
});
