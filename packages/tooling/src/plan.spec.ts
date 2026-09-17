import { describe, expect, it } from 'vitest';

import { planModule } from './plan.js';

describe('planModule', () => {
  const plan = planModule({ name: 'budgeting', title: 'Presupuesto' });
  const paths = plan.files.map((file) => file.path);

  it('creates the module layers in the API', () => {
    expect(paths).toEqual(
      expect.arrayContaining([
        'apps/api/src/modules/budgeting/budgeting.module.ts',
        'apps/api/src/modules/budgeting/index.ts',
        'apps/api/src/modules/budgeting/README.md',
        'apps/api/src/modules/budgeting/domain/.gitkeep',
        'apps/api/src/modules/budgeting/application/.gitkeep',
        'apps/api/src/modules/budgeting/ports/.gitkeep',
        'apps/api/src/modules/budgeting/infrastructure/.gitkeep',
        'apps/api/src/modules/budgeting/http/.gitkeep',
      ]),
    );
  });

  it('creates the web feature, its module sheet and its Gherkin skeleton', () => {
    expect(paths).toEqual(
      expect.arrayContaining([
        'apps/web/src/features/budgeting/manifest.ts',
        'docs/modules/budgeting.md',
        'features/budgeting/budgeting.feature',
      ]),
    );
  });

  it('writes a NestJS module with the derived class name', () => {
    const module = plan.files.find((file) => file.path.endsWith('budgeting.module.ts'));

    expect(module?.contents).toContain('export class BudgetingModule {}');
  });

  it('writes the manifest with the title, the route and its flag', () => {
    const manifest = plan.files.find((file) =>
      file.path.endsWith('features/budgeting/manifest.ts'),
    );

    expect(manifest?.contents).toContain("id: 'budgeting'");
    expect(manifest?.contents).toContain("title: 'Presupuesto'");
    expect(manifest?.contents).toContain("route: '/budgeting'");
    expect(manifest?.contents).toContain("flag: 'FEATURE_BUDGETING'");
  });

  it('writes the Gherkin skeleton in Spanish', () => {
    const feature = plan.files.find((file) => file.path.endsWith('.feature'));

    expect(feature?.contents).toContain('# language: es');
    expect(feature?.contents).toContain('Característica:');
  });

  it('lists the files it has to edit', () => {
    expect(plan.edits).toEqual([
      'apps/web/src/shared/navigation/registry.ts',
      'apps/api/src/app.module.ts',
      'apps/api/.env.example',
      'commitlint.config.js',
    ]);
  });

  it('uses the name as title when none is given', () => {
    const withoutTitle = planModule({ name: 'credit-cards' });
    const manifest = withoutTitle.files.find((file) => file.path.endsWith('manifest.ts'));

    expect(manifest?.contents).toContain("title: 'Credit cards'");
  });
});
