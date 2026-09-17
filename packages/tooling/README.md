# @sol-a-sol/tooling

Herramientas de desarrollo del monorepo. Hoy: el generador de módulos.

## `pnpm gen:module <nombre> [--title "Título"]`

Crea un módulo de negocio completo y **lo registra donde haría falta editar a mano**:

| Crea                                         | Qué es                                                                                                                                 |
| -------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/api/src/modules/<nombre>/`             | Módulo de NestJS, API pública (`index.ts`), ficha corta y las cinco capas (`domain`, `application`, `ports`, `infrastructure`, `http`) |
| `apps/web/src/features/<nombre>/manifest.ts` | Ficha de navegación con su feature flag                                                                                                |
| `docs/modules/<nombre>.md`                   | Ficha del módulo para completar antes de programar                                                                                     |
| `features/<nombre>/<nombre>.feature`         | Esqueleto Gherkin en español                                                                                                           |

| Edita                                        | Para qué                                         |
| -------------------------------------------- | ------------------------------------------------ |
| `apps/web/src/shared/navigation/registry.ts` | Que aparezca en la navegación al activar su flag |
| `apps/api/src/app.module.ts`                 | Que NestJS lo cargue                             |
| `apps/api/.env.example`                      | Documentar su flag, apagado                      |
| `commitlint.config.js`                       | Que sus commits (`feat(<nombre>): …`) no fallen  |

Opciones: `--title` (título visible; por defecto se deriva del nombre), `--dry-run` (muestra qué haría sin escribir) y `--root` (otra raíz, se usa en las pruebas).

## Cómo está hecho

La lógica pura (derivar nombres, planificar archivos, transformar los archivos existentes) está separada de la escritura en disco, así que se prueba sin tocar el sistema de archivos. Las transformaciones son **idempotentes** y, si un archivo no tiene la forma esperada, el generador **no escribe nada** y explica qué falta: es preferible editar a mano que dejar el repositorio a medias.
