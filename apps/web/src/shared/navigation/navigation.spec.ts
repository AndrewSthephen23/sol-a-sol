import { describe, expect, it } from 'vitest';

import { buildNavigation, type FeatureManifest } from './navigation';

const dashboard: FeatureManifest = { id: 'dashboard', title: 'Resumen', route: '/', icon: 'home' };
const budgeting: FeatureManifest = {
  id: 'budgeting',
  title: 'Presupuesto',
  route: '/presupuesto',
  icon: 'wallet',
  flag: 'FEATURE_BUDGETING',
};
const goals: FeatureManifest = {
  id: 'goals',
  title: 'Metas',
  route: '/metas',
  icon: 'target',
  flag: 'FEATURE_GOALS',
};

describe('buildNavigation', () => {
  it('always shows the features without a flag', () => {
    expect(buildNavigation([dashboard], () => false).map((item) => item.id)).toEqual(['dashboard']);
  });

  it('hides the features whose flag is off', () => {
    expect(buildNavigation([dashboard, budgeting], () => false).map((item) => item.id)).toEqual([
      'dashboard',
    ]);
  });

  it('shows the features whose flag is on', () => {
    const enabled = (flag: string): boolean => flag === 'FEATURE_BUDGETING';

    expect(buildNavigation([dashboard, budgeting, goals], enabled).map((item) => item.id)).toEqual([
      'dashboard',
      'budgeting',
    ]);
  });

  it('keeps the declared order', () => {
    const enabled = (): boolean => true;

    expect(buildNavigation([goals, dashboard, budgeting], enabled).map((item) => item.id)).toEqual([
      'goals',
      'dashboard',
      'budgeting',
    ]);
  });

  it('does not modify the given manifests', () => {
    const manifests = [dashboard, budgeting];

    buildNavigation(manifests, () => false);

    expect(manifests).toHaveLength(2);
  });
});
