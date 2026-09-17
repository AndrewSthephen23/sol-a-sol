import { type ModuleNames, moduleNames } from './naming.js';

export interface PlannedFile {
  path: string;
  contents: string;
}

export interface ModulePlan {
  names: ModuleNames;
  title: string;
  files: PlannedFile[];
  /** Archivos existentes que hay que editar (en este orden). */
  edits: string[];
}

export interface PlanModuleOptions {
  name: string;
  title?: string;
}

const API_LAYERS = ['domain', 'application', 'ports', 'infrastructure', 'http'] as const;

export function planModule({ name, title }: PlanModuleOptions): ModulePlan {
  const names = moduleNames(name);
  const moduleTitle = title ?? names.defaultTitle;
  const apiRoot = `apps/api/src/modules/${names.name}`;

  return {
    names,
    title: moduleTitle,
    files: [
      { path: `${apiRoot}/${names.name}.module.ts`, contents: nestModule(names) },
      { path: `${apiRoot}/index.ts`, contents: publicApi(names) },
      { path: `${apiRoot}/README.md`, contents: moduleSheet(names, moduleTitle) },
      ...API_LAYERS.map((layer) => ({ path: `${apiRoot}/${layer}/.gitkeep`, contents: '' })),
      {
        path: `apps/web/src/features/${names.name}/manifest.ts`,
        contents: webManifest(names, moduleTitle),
      },
      { path: `docs/modules/${names.name}.md`, contents: docsSheet(names, moduleTitle) },
      {
        path: `features/${names.name}/${names.name}.feature`,
        contents: gherkinSkeleton(moduleTitle),
      },
    ],
    edits: [
      'apps/web/src/shared/navigation/registry.ts',
      'apps/api/src/app.module.ts',
      'apps/api/.env.example',
      'commitlint.config.js',
    ],
  };
}

function nestModule(names: ModuleNames): string {
  return `import { Module } from '@nestjs/common';

/**
 * Módulo ${names.name}. Entra a main detrás de ${names.envVar}: sus rutas llevan
 * \`@RequiresFeature('${names.name}')\` y responden 404 mientras el flag esté apagado.
 */
@Module({
  controllers: [],
  providers: [],
  exports: [],
})
export class ${names.className}Module {}
`;
}

function publicApi(names: ModuleNames): string {
  return `// API pública del módulo ${names.name}.
// Otros módulos solo pueden importar desde aquí, nunca de sus carpetas internas.
export { ${names.className}Module } from './${names.name}.module.js';
`;
}

function moduleSheet(names: ModuleNames, title: string): string {
  return `# ${title} (\`${names.name}\`)

Qué hace este módulo, en una frase.

- **Feature flag:** \`${names.envVar}\`
- **Capas:** \`domain\`, \`application\`, \`ports\`, \`infrastructure\`, \`http\` (ver [ADR-0001](../../../../docs/adr/0001-monolito-modular.md))
- **Ficha completa:** [\`docs/modules/${names.name}.md\`](../../../../docs/modules/${names.name}.md)
`;
}

function docsSheet(names: ModuleNames, title: string): string {
  return `# Módulo ${title} (\`${names.name}\`)

> Ficha del módulo. Completar antes de escribir código.

## Qué resuelve

Qué decisión financiera permite tomar.

## Reglas de negocio

Cálculos, redondeos y casos borde (meses cortos, monto cero, varias monedas).

## Eventos de dominio

- **Emite:**
- **Escucha:**

## Endpoints

| Método | Ruta | Qué hace |
| ------ | ---- | -------- |

## Estado

- Feature flag: \`${names.envVar}\` (apagado hasta cumplir la Definition of Done)
- Escenarios: [\`features/${names.name}/\`](../../features/${names.name}/)
`;
}

function webManifest(names: ModuleNames, title: string): string {
  return `import { type FeatureManifest } from '@/shared/navigation/navigation';

export const ${names.manifestName}: FeatureManifest = {
  id: '${names.name}',
  title: '${title}',
  route: '/${names.name}',
  icon: 'square',
  flag: '${names.envVar}',
};
`;
}

function gherkinSkeleton(title: string): string {
  return `# language: es
Característica: ${title}

  # Criterios de aceptación del issue, en lenguaje de negocio.
  # Un escenario por regla; los montos van con su moneda ("S/ 1,234.50").

  Escenario: (describe el caso)
    Dado que ...
    Cuando ...
    Entonces ...
`;
}
