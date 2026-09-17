import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { run } from './cli.js';

const REGISTRY = `import { dashboardManifest } from '@/features/dashboard/manifest';

import { type FeatureManifest } from './navigation';

export const featureManifests: readonly FeatureManifest[] = [dashboardManifest];
`;

const APP_MODULE = `import { Module } from '@nestjs/common';

import { HealthModule } from './shared/health/health.module.js';

@Module({
  imports: [HealthModule],
})
export class AppModule {}
`;

const ENV_EXAMPLE = `PORT=3001

FEATURE_IDENTITY=false
`;

const COMMITLINT = `export default {
  rules: {
    'scope-enum': [
      2,
      'always',
      [
        // Módulos de negocio
        'identity',
        // Apps y paquetes
        'api',
      ],
    ],
  },
};
`;

let root: string;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'sol-a-sol-gen-'));
  await mkdir(join(root, 'apps/web/src/shared/navigation'), { recursive: true });
  await mkdir(join(root, 'apps/api/src'), { recursive: true });
  await writeFile(join(root, 'apps/web/src/shared/navigation/registry.ts'), REGISTRY);
  await writeFile(join(root, 'apps/api/src/app.module.ts'), APP_MODULE);
  await writeFile(join(root, 'apps/api/.env.example'), ENV_EXAMPLE);
  await writeFile(join(root, 'commitlint.config.js'), COMMITLINT);
  vi.spyOn(process.stdout, 'write').mockReturnValue(true);
  vi.spyOn(process.stderr, 'write').mockReturnValue(true);
});

afterEach(() => {
  vi.restoreAllMocks();
});

const read = (path: string): Promise<string> => readFile(join(root, path), 'utf8');

describe('gen:module', () => {
  it('creates the module and registers it everywhere', async () => {
    const code = await run(['budgeting', '--title', 'Presupuesto', '--root', root]);

    expect(code).toBe(0);
    await expect(read('apps/api/src/modules/budgeting/budgeting.module.ts')).resolves.toContain(
      'export class BudgetingModule {}',
    );
    await expect(read('apps/web/src/features/budgeting/manifest.ts')).resolves.toContain(
      "title: 'Presupuesto'",
    );
    await expect(read('docs/modules/budgeting.md')).resolves.toContain('FEATURE_BUDGETING');
    await expect(read('features/budgeting/budgeting.feature')).resolves.toContain('# language: es');
    await expect(read('apps/web/src/shared/navigation/registry.ts')).resolves.toContain(
      'budgetingManifest]',
    );
    await expect(read('apps/api/src/app.module.ts')).resolves.toContain('BudgetingModule]');
    await expect(read('apps/api/.env.example')).resolves.toContain('FEATURE_BUDGETING=false');
    await expect(read('commitlint.config.js')).resolves.toContain("'budgeting',");
  });

  it('refuses to overwrite a module that already exists', async () => {
    await run(['budgeting', '--root', root]);

    expect(await run(['budgeting', '--root', root])).toBe(1);
  });

  it('writes nothing with --dry-run', async () => {
    const code = await run(['budgeting', '--root', root, '--dry-run']);

    expect(code).toBe(0);
    await expect(read('apps/api/src/modules/budgeting/budgeting.module.ts')).rejects.toThrow();
    await expect(read('apps/api/.env.example')).resolves.not.toContain('FEATURE_BUDGETING');
  });

  it('writes nothing when a file to edit is missing its anchor', async () => {
    await writeFile(join(root, 'commitlint.config.js'), 'export default {};\n');

    const code = await run(['budgeting', '--root', root]);

    expect(code).toBe(1);
    await expect(read('apps/api/src/modules/budgeting/budgeting.module.ts')).rejects.toThrow();
    await expect(read('apps/api/.env.example')).resolves.not.toContain('FEATURE_BUDGETING');
  });

  it.each([
    ['an invalid name', ['Budgeting']],
    ['no name', []],
    ['an unknown option', ['budgeting', '--turbo']],
    ['a flag without a value', ['budgeting', '--title']],
  ])('fails with %s', async (_description, args) => {
    expect(await run([...args, '--root', root])).toBe(1);
  });
});
