import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import process from 'node:process';

import { InvalidModuleNameError } from './naming.js';
import { type ModulePlan, planModule } from './plan.js';
import {
  addCommitScope,
  addFeatureFlag,
  addManifestToRegistry,
  addModuleToAppModule,
  MissingAnchorError,
} from './transforms.js';

interface CliOptions {
  name: string;
  title?: string;
  root: string;
  dryRun: boolean;
}

const EDITS: Record<string, (source: string, names: ModulePlan['names']) => string> = {
  'apps/web/src/shared/navigation/registry.ts': addManifestToRegistry,
  'apps/api/src/app.module.ts': addModuleToAppModule,
  'apps/api/.env.example': addFeatureFlag,
  'commitlint.config.js': addCommitScope,
};

export async function run(argv: readonly string[]): Promise<number> {
  let options: CliOptions;
  try {
    options = parseArgs(argv);
  } catch (error) {
    process.stderr.write(
      `${describe(error)}\n\nUso: pnpm gen:module <nombre> [--title "Título"]\n`,
    );
    return 1;
  }

  let plan: ModulePlan;
  try {
    plan = planModule({ name: options.name, title: options.title });
  } catch (error) {
    process.stderr.write(`${describe(error)}\n`);
    return 1;
  }

  const moduleDir = join(options.root, `apps/api/src/modules/${plan.names.name}`);
  if (existsSync(moduleDir)) {
    process.stderr.write(`El módulo ${plan.names.name} ya existe en ${moduleDir}.\n`);
    return 1;
  }

  try {
    await applyPlan(plan, options);
  } catch (error) {
    process.stderr.write(`${describe(error)}\n`);
    return 1;
  }

  process.stdout.write(summary(plan, options));
  return 0;
}

async function applyPlan(plan: ModulePlan, options: CliOptions): Promise<void> {
  // Primero se calculan todas las ediciones: si alguna falla, no se escribe nada.
  const edited = new Map<string, string>();
  for (const file of plan.edits) {
    const path = join(options.root, file);
    const transform = EDITS[file];
    if (transform === undefined) {
      throw new MissingAnchorError(file, 'una transformación registrada');
    }
    edited.set(path, transform(await readFile(path, 'utf8'), plan.names));
  }

  if (options.dryRun) {
    return;
  }

  for (const file of plan.files) {
    const path = join(options.root, file.path);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, file.contents, 'utf8');
  }
  for (const [path, contents] of edited) {
    await writeFile(path, contents, 'utf8');
  }
}

function summary(plan: ModulePlan, options: CliOptions): string {
  const created = plan.files.map((file) => `  + ${file.path}`).join('\n');
  const edited = plan.edits.map((file) => `  ~ ${file}`).join('\n');
  const prefix = options.dryRun
    ? 'Simulación (no se escribió nada)'
    : `Módulo ${plan.names.name} creado`;

  return `${prefix}:\n${created}\n${edited}\n
Siguientes pasos:
  1. Completa la ficha en docs/modules/${plan.names.name}.md y los escenarios en features/${plan.names.name}/.
  2. Escribe la lógica en packages/domain con TDD.
  3. Activa el módulo con ${plan.names.envVar}=true cuando cumpla la Definition of Done.
`;
}

function parseArgs(argv: readonly string[]): CliOptions {
  const args = [...argv];
  let name: string | undefined;
  let title: string | undefined;
  let root = process.cwd();
  let dryRun = false;

  while (args.length > 0) {
    const arg = args.shift();
    if (arg === undefined) break;
    if (arg === '--title') title = required(args.shift(), '--title');
    else if (arg === '--root') root = resolve(required(args.shift(), '--root'));
    else if (arg === '--dry-run') dryRun = true;
    else if (arg.startsWith('-')) throw new Error(`Opción desconocida: ${arg}`);
    else if (name === undefined) name = arg;
    else throw new Error(`Argumento inesperado: ${arg}`);
  }

  if (name === undefined) {
    throw new Error('Falta el nombre del módulo.');
  }
  return { name, title, root, dryRun };
}

function required(value: string | undefined, flag: string): string {
  if (value === undefined) {
    throw new Error(`${flag} necesita un valor.`);
  }
  return value;
}

function describe(error: unknown): string {
  if (error instanceof InvalidModuleNameError || error instanceof MissingAnchorError) {
    return error.message;
  }
  return error instanceof Error ? error.message : String(error);
}
