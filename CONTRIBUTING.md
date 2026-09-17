# Cómo contribuir

Gracias por pasar por aquí. Este es un proyecto personal de finanzas que también sirve para practicar calidad de software, así que el proceso es deliberadamente estricto.

Antes de programar, conviene leer [`CLAUDE.md`](CLAUDE.md) (reglas del dominio que no se deducen del código) y los [ADR](docs/adr/) (por qué la arquitectura es como es).

## Entorno

Requisitos y puesta en marcha: [`README.md`](README.md). En resumen:

```bash
nvm use && corepack enable && pnpm install
cp .env.example .env
pnpm dev        # db + api + web en Docker, con hot reload
```

## Flujo de trabajo

GitHub Flow: `main` siempre desplegable y ramas cortas.

1. **Abre un issue** con la plantilla que corresponda (bug, funcionalidad, nuevo módulo o deuda técnica). Los criterios de aceptación se escriben como **escenarios Gherkin en español**.
2. **Crea una rama** desde `main`: `feat/…`, `fix/…`, `chore/…`, `docs/…`, `test/…` o `ci/…`.
3. **Trabaja en este orden:** escenarios Gherkin → TDD del dominio → caso de uso → persistencia → endpoint → UI → E2E → documentación.
4. **Abre un PR pequeño** (idealmente menos de 400 líneas). No mezcles refactorizaciones con funcionalidades.
5. **Fusiona con squash** cuando los checks estén en verde. La rama se borra sola.

`main` está protegida: no acepta push directo y exige `CI OK`, los dos análisis de CodeQL, gitleaks y `pnpm audit`, con la rama al día.

## Commits

[Conventional Commits](https://www.conventionalcommits.org/es/) **en inglés**, con scope del módulo o área (la lista está en `commitlint.config.js`):

```
feat(credit-cards): compute payment due date
fix(transactions): keep amounts positive on import
chore(deps): bump prettier
```

El hook `commit-msg` los valida localmente y CI los vuelve a validar en el PR.

## Pruebas

- **TDD obligatorio** en `packages/domain` y `packages/capture-parsers`: primero la prueba que falla.
- **Un bug corregido = una prueba que lo reproduce primero.**
- Nada de pruebas que dependan del reloj real, de la red externa o del orden de ejecución.

| Nivel       | Herramienta             | Alcance                                              | Umbral                                        |
| ----------- | ----------------------- | ---------------------------------------------------- | --------------------------------------------- |
| Unitarias   | Vitest                  | dominio, parsers, casos de uso con puertos simulados | líneas ≥ 90 % en `domain` y `capture-parsers` |
| Mutación    | Stryker                 | `packages/domain`                                    | mutation score ≥ 80 %                         |
| Integración | Vitest + Testcontainers | repositorios Prisma, controllers, autorización       | cada endpoint: caso feliz + acceso denegado   |
| BDD         | Cucumber.js             | reglas de negocio                                    | un `.feature` por módulo                      |
| E2E         | Playwright              | login, registrar gasto, dashboard, confirmar captura | verde en escritorio y móvil                   |
| Global      | —                       | todo el repositorio                                  | cobertura ≥ 80 %                              |

## Antes de abrir el PR

```bash
pnpm lint && pnpm typecheck && pnpm test && pnpm build
pnpm test:integration   # si tocaste API, base de datos o migraciones
pnpm test:mutation      # si tocaste packages/domain (también corre en CI)
```

### Definition of Done

- [ ] Cumple los criterios de aceptación del issue (escenarios Gherkin en verde)
- [ ] Tiene pruebas unitarias y de integración; umbrales de cobertura cumplidos
- [ ] Sin errores de lint, tipos ni quality gate
- [ ] Sin vulnerabilidades críticas o altas nuevas
- [ ] Endpoints documentados en OpenAPI; cliente web regenerado
- [ ] Autorización por usuario verificada con una prueba (`userId`, anti-IDOR)
- [ ] Funciona en viewport móvil
- [ ] Documentación actualizada (ficha del módulo, README, ADR si aplica)
- [ ] Changeset agregado
- [ ] Verificado con `docker compose` (desde H8: desplegado en staging)

En el PR, explica también **qué atributo de calidad** (ISO/IEC 25010) mejora o protege el cambio.

## Versionado y releases

El proyecto usa [Changesets](https://github.com/changesets/changesets) con **una sola versión para todo el producto**: todos los paquetes `@sol-a-sol/*` suben juntos.

### En cada PR

```bash
pnpm changeset
```

Elige los paquetes, el tipo de cambio y escribe un resumen **en español** (se copia tal cual al `CHANGELOG.md`). Se crea un archivo en `.changeset/` que va en el mismo PR. El job **Changeset** de CI falla si el PR cambia un paquete y no lo trae.

| Tipo de cambio | Mientras la versión sea `0.x`                    | Ejemplo           |
| -------------- | ------------------------------------------------ | ----------------- |
| `minor`        | Cierre de un hito del plan                       | H1 → `0.2.0`      |
| `patch`        | Corrección o avance dentro de un hito            | `0.2.0` → `0.2.1` |
| `major`        | Reservado para `1.0.0` (salida a producción, H8) | —                 |

Si el cambio no necesita versión (refactor interno, pruebas, CI): `pnpm changeset --empty`.

### Publicar una versión

1. Crea la rama `release/vX.Y.Z` desde `main` actualizado.
2. Ejecuta `pnpm version-packages`: consume los changesets, sube las versiones y escribe los `CHANGELOG.md`.
3. Revisa los cambios y abre el PR con el commit `chore(release): vX.Y.Z` (el job Changeset se salta en ramas `release/*`).
4. Al fusionarlo, el workflow **Release** crea las etiquetas `vX.Y.Z` y `@sol-a-sol/<paquete>@X.Y.Z` y publica el **GitHub Release** con las notas del changelog. Las versiones `0.x` se publican como _pre-release_.

## Dependencias

No agregues dependencias sin justificarlo en el PR (y en un ADR si es estructural); prefiere lo que ya está en el stack. La política completa (antigüedad mínima de versiones, scripts de instalación aprobados, `overrides`) está en el [`README.md`](README.md#política-de-dependencias).

## Documentación

Se actualiza **en el mismo PR** que el código:

- Ficha del módulo en `docs/modules/<modulo>.md`.
- `README.md` si cambian comandos, requisitos o versiones del stack.
- Un **ADR nuevo** en `docs/adr/` si la decisión es estructural (ver [cuándo escribir un ADR](docs/adr/README.md)).
- Los ADR no se editan: se escribe uno nuevo que supersede al anterior.

## Idioma

- **Código, identificadores, nombres de archivo y mensajes de commit: inglés.**
- **Interfaz, documentación, comentarios y escenarios Gherkin: español.**
- Equivalencias en el [glosario](docs/glosario.md).
