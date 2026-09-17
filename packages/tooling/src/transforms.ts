import { type ModuleNames } from './naming.js';

/**
 * El archivo que hay que editar no tiene la forma esperada. Se falla en vez de escribir
 * algo a medias: es preferible editar a mano que dejar el repositorio corrupto.
 */
export class MissingAnchorError extends Error {
  constructor(
    readonly file: string,
    readonly anchor: string,
  ) {
    super(`No se pudo editar ${file}: no se encontró ${anchor}.`);
    this.name = 'MissingAnchorError';
  }
}

const MANIFEST_IMPORT = /^import \{ \w+ \} from '@\/features\/[^']+\/manifest';$/gmu;
const MANIFEST_LIST = /(featureManifests: readonly FeatureManifest\[\] = \[)([^\]]*)\]/u;
const IMPORT_LINE = /^import .+;$/gmu;
const NEST_IMPORTS = /(imports: \[)([^\]]*)\]/u;
const BUSINESS_SCOPES = /^( *)\/\/ Apps y paquetes$/mu;
const FEATURE_FLAG_LINE = /^FEATURE_[A-Z0-9_]+=.*$/gmu;

/** Registra el manifest de la funcionalidad en la navegación de la web. */
export function addManifestToRegistry(source: string, names: ModuleNames): string {
  const file = 'apps/web/src/shared/navigation/registry.ts';
  if (source.includes(names.manifestName)) {
    return source;
  }
  const withImport = insertAfterLastMatch(
    source,
    MANIFEST_IMPORT,
    `import { ${names.manifestName} } from '@/features/${names.name}/manifest';`,
    () => new MissingAnchorError(file, 'ningún import de manifest'),
  );
  const list = MANIFEST_LIST.exec(withImport);
  if (list === null) {
    throw new MissingAnchorError(file, 'la lista featureManifests');
  }
  const [matched, start = '', current = ''] = list;
  const separator = current.trim() === '' ? '' : ', ';
  return withImport.replace(matched, `${start}${current}${separator}${names.manifestName}]`);
}

/** Agrega el feature flag apagado al `.env.example` de la API. */
export function addFeatureFlag(source: string, names: ModuleNames): string {
  if (new RegExp(`^${names.envVar}=`, 'mu').test(source)) {
    return source;
  }
  return insertAfterLastMatch(
    source,
    FEATURE_FLAG_LINE,
    `${names.envVar}=false`,
    () => new MissingAnchorError('apps/api/.env.example', 'ningún FEATURE_*'),
  );
}

/** Declara el módulo en el `AppModule` de NestJS. */
export function addModuleToAppModule(source: string, names: ModuleNames): string {
  const file = 'apps/api/src/app.module.ts';
  const moduleClass = `${names.className}Module`;
  if (source.includes(moduleClass)) {
    return source;
  }
  const withImport = insertAfterLastMatch(
    source,
    IMPORT_LINE,
    `import { ${moduleClass} } from './modules/${names.name}/${names.name}.module.js';`,
    () => new MissingAnchorError(file, 'ningún import'),
  );
  const imports = NEST_IMPORTS.exec(withImport);
  if (imports === null) {
    throw new MissingAnchorError(file, 'el arreglo imports del decorador @Module');
  }
  const [matched, start = '', current = ''] = imports;
  const separator = current.trim() === '' ? '' : ', ';
  return withImport.replace(matched, `${start}${current}${separator}${moduleClass}]`);
}

/** Habilita el módulo como scope válido de commitlint, para que sus commits no fallen. */
export function addCommitScope(source: string, names: ModuleNames): string {
  if (new RegExp(`'${names.name}',`, 'u').test(source)) {
    return source;
  }
  const anchor = BUSINESS_SCOPES.exec(source);
  if (anchor === null) {
    throw new MissingAnchorError('commitlint.config.js', 'la lista de scopes de módulos');
  }
  const [matched, indent = ''] = anchor;
  return source.replace(matched, `${indent}'${names.name}',\n${matched}`);
}

function insertAfterLastMatch(
  source: string,
  pattern: RegExp,
  line: string,
  onMissing: () => MissingAnchorError,
): string {
  const matches = [...source.matchAll(pattern)];
  const last = matches.at(-1);
  if (last?.index === undefined) {
    throw onMissing();
  }
  const end = last.index + last[0].length;
  return `${source.slice(0, end)}\n${line}${source.slice(end)}`;
}
