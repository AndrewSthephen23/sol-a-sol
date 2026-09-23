import { describe, expect, it } from 'vitest';

import { moduleNames } from './naming.js';
import {
  addFeatureFlag,
  addModuleToAppModule,
  addManifestToRegistry,
  addCommitScope,
  MissingAnchorError,
} from './transforms.js';

const budgeting = moduleNames('budgeting');

describe('addManifestToRegistry', () => {
  const registry = `import { dashboardManifest } from '@/features/dashboard/manifest';

import { type FeatureManifest } from './navigation';

export const featureManifests: readonly FeatureManifest[] = [dashboardManifest];
`;

  it('imports the manifest and adds it at the end of the list', () => {
    const result = addManifestToRegistry(registry, budgeting);

    expect(result).toContain("import { budgetingManifest } from '@/features/budgeting/manifest';");
    expect(result).toContain('[dashboardManifest, budgetingManifest]');
  });

  // Prettier parte la lista en varias líneas, con coma final, cuando ya no cabe en una.
  it('adds the manifest on its own line when the list spans several lines', () => {
    const multiline = registry.replace(
      '[dashboardManifest]',
      '[\n  dashboardManifest,\n  transactionsManifest,\n]',
    );

    expect(addManifestToRegistry(multiline, budgeting)).toContain(
      '[\n  dashboardManifest,\n  transactionsManifest,\n  budgetingManifest,\n]',
    );
  });

  it('does nothing when the module is already registered', () => {
    const once = addManifestToRegistry(registry, budgeting);

    expect(addManifestToRegistry(once, budgeting)).toBe(once);
  });

  it('fails when the registry does not have the expected shape', () => {
    expect(() => addManifestToRegistry('otra cosa', budgeting)).toThrow(MissingAnchorError);
  });
});

describe('addFeatureFlag', () => {
  const env = `PORT=3001

# Feature flags
FEATURE_IDENTITY=false
FEATURE_CAPTURE=false
`;

  it('adds the flag turned off, after the last one', () => {
    expect(addFeatureFlag(env, budgeting)).toContain(
      'FEATURE_CAPTURE=false\nFEATURE_BUDGETING=false',
    );
  });

  it('does nothing when the flag already exists', () => {
    const once = addFeatureFlag(env, budgeting);

    expect(addFeatureFlag(once, budgeting)).toBe(once);
  });

  it('fails when there is no flag section', () => {
    expect(() => addFeatureFlag('PORT=3001\n', budgeting)).toThrow(MissingAnchorError);
  });
});

describe('addModuleToAppModule', () => {
  const appModule = `import { Module } from '@nestjs/common';

import { HealthModule } from './shared/health/health.module.js';

@Module({
  imports: [PrismaModule, FeatureFlagsModule, HealthModule],
})
export class AppModule {}
`;

  it('imports the module and adds it to the imports array', () => {
    const result = addModuleToAppModule(appModule, budgeting);

    expect(result).toContain(
      "import { BudgetingModule } from './modules/budgeting/budgeting.module.js';",
    );
    expect(result).toContain('HealthModule, BudgetingModule]');
  });

  // Es la forma real del AppModule desde H2: con [a, , b] NestJS recibe un import undefined.
  it('adds the module on its own line when the array spans several lines', () => {
    const multiline = appModule.replace(
      '[PrismaModule, FeatureFlagsModule, HealthModule]',
      '[\n    PrismaModule,\n    FeatureFlagsModule,\n    HealthModule,\n  ]',
    );

    expect(addModuleToAppModule(multiline, budgeting)).toContain(
      '[\n    PrismaModule,\n    FeatureFlagsModule,\n    HealthModule,\n    BudgetingModule,\n  ]',
    );
  });

  it('does nothing when the module is already imported', () => {
    const once = addModuleToAppModule(appModule, budgeting);

    expect(addModuleToAppModule(once, budgeting)).toBe(once);
  });

  it('fails when the imports array is missing', () => {
    expect(() => addModuleToAppModule('export class AppModule {}', budgeting)).toThrow(
      MissingAnchorError,
    );
  });
});

describe('addCommitScope', () => {
  const config = `export default {
  rules: {
    'scope-enum': [
      2,
      'always',
      [
        // Módulos de negocio
        'identity',
        'capture',
        // Apps y paquetes
        'api',
      ],
    ],
  },
};
`;

  it('adds the module as a valid commit scope', () => {
    expect(addCommitScope(config, budgeting)).toContain("'capture',\n        'budgeting',");
  });

  it('does nothing when the scope already exists', () => {
    const once = addCommitScope(config, budgeting);

    expect(addCommitScope(once, budgeting)).toBe(once);
  });

  it('fails when the scope list is missing', () => {
    expect(() => addCommitScope('export default {};', budgeting)).toThrow(MissingAnchorError);
  });
});
