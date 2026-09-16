# Sol a Sol

Plataforma personal para ordenar mis finanzas y avanzar hacia la libertad financiera, sol a sol. Presupuesto, gastos, tarjetas y metas de ahorro, con captura desde el celular. Construida con calidad de software: TDD, BDD, CI/CD y Docker.

> Proyecto de aplicación del curso [Calidad de Software](https://ecuadros.github.io/SoftwareQuality/): ISO/IEC 25010, GitHub Flow, TDD, BDD, CI/CD, análisis estático, seguridad y observabilidad.

## Estado

🚧 **Hito H0 — Cimientos** (en curso). Esta versión contiene el esqueleto del monorepo, las configuraciones compartidas, la API con `/health` y `/health/ready`, Prisma con el modelo `User` y su primera migración, la página inicial de la web, el entorno completo con Docker Compose y los pipelines de CI y seguridad en GitHub Actions.

## Documentación

| Documento                            | Para qué                                                              |
| ------------------------------------ | --------------------------------------------------------------------- |
| [CONTRIBUTING.md](CONTRIBUTING.md)   | Flujo de trabajo, commits, pruebas y Definition of Done               |
| [CLAUDE.md](CLAUDE.md)               | Reglas del dominio: dinero, fechas, `userId`, fronteras entre módulos |
| [docs/adr/](docs/adr/)               | Decisiones de arquitectura y por qué se tomaron                       |
| [docs/glosario.md](docs/glosario.md) | Equivalencias entre los términos del negocio (ES) y del código (EN)   |

## Requisitos

| Herramienta             | Versión                                          | Cómo              |
| ----------------------- | ------------------------------------------------ | ----------------- |
| Node.js                 | ≥ 24.15 (recomendada **24.21.0**, ver `.nvmrc`)  | `nvm use`         |
| pnpm                    | **12.4.2** (fijada en `packageManager`)          | `corepack enable` |
| gitleaks                | **8.30.1** (obligatorio para el hook pre-commit) | Ver abajo         |
| Docker + Docker Compose | Docker 29+ / Compose v2 (probado con 5.3)        | Docker Desktop    |

## Primeros pasos

```bash
nvm use
corepack enable
pnpm install   # también activa los hooks de Git (husky)
```

Instalar gitleaks sin sudo (Linux/WSL x64):

```bash
V=8.30.1
curl -sSLO https://github.com/gitleaks/gitleaks/releases/download/v$V/gitleaks_${V}_linux_x64.tar.gz
tar -xzf gitleaks_${V}_linux_x64.tar.gz gitleaks
install -m 0755 gitleaks ~/.local/bin/gitleaks
```

En macOS: `brew install gitleaks`.

## Hooks de Git

| Hook         | Qué valida                                                                                                                   |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------- |
| `pre-commit` | **gitleaks** sobre los cambios en stage (bloquea secretos) y **lint-staged** (ESLint + Prettier sobre los archivos en stage) |
| `commit-msg` | **commitlint**: Conventional Commits; el scope, si se usa, debe ser un módulo o área válida (ver `commitlint.config.js`)     |

Ejemplos válidos: `feat(credit-cards): compute payment due date`, `chore(deps): bump prettier`, `docs: update readme`.

## Comandos

| Comando                             | Qué hace                                                                                  |
| ----------------------------------- | ----------------------------------------------------------------------------------------- |
| `pnpm build`                        | Compila todos los paquetes (Turborepo)                                                    |
| `pnpm dev`                          | Levanta todo con Docker Compose (db, api, web) con hot reload                             |
| `pnpm dev:local`                    | Levanta las apps sin Docker (necesita un PostgreSQL accesible)                            |
| `pnpm docker:test`                  | Levanta las imágenes de producción (`docker-compose.test.yml`) y espera a que estén sanas |
| `pnpm lint`                         | ESLint en todos los paquetes                                                              |
| `pnpm typecheck`                    | Verificación de tipos en todos los paquetes                                               |
| `pnpm test`                         | Pruebas unitarias                                                                         |
| `pnpm test:integration`             | Pruebas de integración de la API con PostgreSQL real (Testcontainers; requiere Docker)    |
| `pnpm db:generate`                  | Genera el cliente de Prisma (`apps/api/src/generated`, no versionado)                     |
| `pnpm db:migrate`                   | Crea/aplica migraciones en desarrollo (`prisma migrate dev`)                              |
| `pnpm db:studio`                    | Abre Prisma Studio                                                                        |
| `pnpm format` / `pnpm format:check` | Formatea / verifica formato con Prettier                                                  |

Más comandos (`test:e2e`, `db:seed`, `gen:module`, etc.) se irán agregando en los hitos siguientes.

Para trabajar en una sola app: `pnpm --filter @sol-a-sol/api dev` (http://localhost:3001/health) o `pnpm --filter @sol-a-sol/web dev` (http://localhost:3000).

La API expone `GET /health` (liveness) y `GET /health/ready` (readiness: 503 si PostgreSQL no responde).

## Docker

### Desarrollo (`docker-compose.yml`)

```bash
cp .env.example .env   # una sola vez; Compose falla si falta una variable obligatoria
pnpm dev               # = docker compose up --build
```

| Servicio | URL (solo 127.0.0.1)               | Notas                                                                       |
| -------- | ---------------------------------- | --------------------------------------------------------------------------- |
| `db`     | `localhost:5432`                   | PostgreSQL 18.6; volumen `db-data`; healthcheck por TCP                     |
| `api`    | http://localhost:3001/health/ready | Al iniciar: `prisma migrate dev` + `prisma generate` + `nest start --watch` |
| `web`    | http://localhost:3000              | `next dev`; arranca cuando la API está sana                                 |

- **Hot reload:** se montan `apps/api/src`, `apps/api/prisma` y `apps/web/src`. Si cambian dependencias: `docker compose build`.
- **Herramientas opcionales:** `docker compose --profile tools up -d` → Adminer (http://localhost:8080) y Mailpit (http://localhost:8025).
- **Sin Docker:** `cp apps/api/.env.example apps/api/.env`, apuntar `DATABASE_URL` a un PostgreSQL y usar `pnpm dev:local`.

### Imágenes de producción y CI (`docker-compose.test.yml`)

```bash
pnpm docker:test        # build + up --wait: db (tmpfs) → migrate (un solo uso) → api → web
pnpm docker:test:down
```

Dockerfiles multi-stage en `docker/` (`pruner` → `deps` → `build` → `runtime`; más `dev` y `migrate`):

- Base `node:24.21.0-trixie-slim` y `postgres:18.6-alpine3.24` **fijadas por digest**.
- `turbo prune --docker` + caché del store de pnpm: la instalación de dependencias solo se repite si cambia el lockfile.
- Imagen final con **usuario `node`**, archivos de la app propiedad de root (solo lectura), `HEALTHCHECK`, parches de seguridad de Debian aplicados y **sin npm ni corepack**.
- API: solo dependencias de producción (`pnpm deploy --prod`) y `dist/`. Web: salida `standalone` de Next.js.
- Las credenciales del entorno de pruebas no son secretas (base efímera) y se pueden sobrescribir por variables de entorno.

## Estructura

```
sol-a-sol/
├── .github/
│   ├── actions/setup/  # action compuesta: pnpm + Node.js + dependencias
│   ├── workflows/      # ci.yml, security.yml
│   └── dependabot.yml
├── docker/        # Dockerfiles multi-stage e init.sql de PostgreSQL
├── docs/
│   ├── adr/       # Architecture Decision Records
│   └── glosario.md
├── CONTRIBUTING.md # Flujo de trabajo, commits, pruebas y Definition of Done
├── CLAUDE.md       # Reglas del dominio para agentes y personas nuevas
├── apps/
│   ├── api/       # @sol-a-sol/api: NestJS (ESM). Prefijo /api/v1; /health fuera del prefijo
│   │   ├── prisma/  # schema.prisma y migraciones versionadas (nunca editar una ya aplicada)
│   │   └── test/    # integración con Testcontainers
│   └── web/       # @sol-a-sol/web: Next.js App Router + Tailwind CSS
└── packages/
    └── config/    # @sol-a-sol/config: tsconfig, ESLint y Prettier compartidos
```

## Política de dependencias

pnpm 12 aplica un **`minimumReleaseAge`** (las versiones publicadas hace menos de un día se rechazan) como defensa ante paquetes comprometidos. No se agregan excepciones en `minimumReleaseAgeExclude`: si una versión es demasiado nueva, se fija la anterior.

- **Scripts de instalación:** solo se ejecutan los aprobados explícitamente en `allowBuilds` (`pnpm-workspace.yaml`), revisados uno por uno.
- **Vulnerabilidades en dependencias transitivas:** `pnpm audit --audit-level high` corre en CI. Si el paquete que trae la dependencia vulnerable no se puede actualizar, se fuerza la versión corregida con `overrides` en `pnpm-workspace.yaml`, documentando el advisory y cómo se validó. Hay que revisar esos overrides al actualizar el paquete de origen.
- **Dependabot** (`.github/dependabot.yml`) propone actualizaciones semanales de npm, GitHub Actions, Dockerfiles y Compose, agrupadas y con 3 días de espera desde la publicación.

## CI/CD

| Workflow       | Cuándo                                 | Jobs                                                                                                                                                                                                                                                                                                     |
| -------------- | -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ci.yml`       | PR y push a `main`                     | commitlint (commits del PR) · formato + lint + tipos · pruebas unitarias con cobertura · integración (Testcontainers) · build · imágenes Docker: build, **Trivy** (bloquea CRITICAL con corrección disponible) y smoke test con `docker-compose.test.yml` · **CI OK** (check único para proteger `main`) |
| `security.yml` | PR, push a `main` y lunes 06:00 (Lima) | **CodeQL** (JavaScript/TypeScript y GitHub Actions, `security-extended`) · **gitleaks** (commits del PR o historial completo) · **pnpm audit** (falla con high/critical)                                                                                                                                 |

El job **SonarQube Cloud** ejecuta el análisis estático con el quality gate bloqueante (`sonar.qualitygate.wait=true`) sobre la cobertura `lcov` que generan los dos paquetes. Mientras no exista el secreto `SONAR_TOKEN`, sus pasos se omiten con un aviso.

**Conectar SonarQube Cloud** (una sola vez):

1. Entrar a [sonarcloud.io](https://sonarcloud.io) con la cuenta de GitHub y crear la organización a partir del repositorio.
2. Analizar el proyecto con **GitHub Actions** como método; anotar `projectKey` y `organization`.
3. Si no coinciden con `sonar-project.properties`, corregir ese archivo.
4. Generar un token y guardarlo como secreto del repositorio: `gh secret set SONAR_TOKEN`.
5. En SonarQube Cloud, desactivar el análisis automático para que solo analice el workflow.

- Todas las actions de terceros están **fijadas por SHA de commit** (con la versión en un comentario); Dependabot las actualiza.
- Trivy y gitleaks se ejecutan desde binarios o imágenes fijados por versión y checksum/digest.
- `.gitleaks.toml` mantiene **todas** las reglas por defecto y solo agrega excepciones puntuales y justificadas (hoy: `sonar.projectKey`, que es un identificador público). Cada excepción debe indicar archivo y patrón exactos.
- Los workflows tienen permisos mínimos (`contents: read`; `security-events: write` solo para CodeQL).

## Flujo de trabajo en GitHub

GitHub Flow: `main` siempre desplegable y ramas cortas `feat/…`, `fix/…`, `chore/…`, `docs/…`, `test/…`, `ci/…`.

**`main` está protegida:**

- PR obligatorio; no se puede hacer push directo ni forzado, ni borrar la rama.
- Checks requeridos en verde y la rama al día con `main`: **CI OK**, **CodeQL (javascript-typescript)**, **CodeQL (actions)**, **Secretos (gitleaks)** y **Dependencias (pnpm audit)**.
- Historial lineal y **solo squash merge**; la rama se borra al fusionar.
- Conversaciones resueltas antes de fusionar.

**Plantillas** en `.github/`: issues de bug, funcionalidad, nuevo módulo y deuda técnica (con etiquetas `type:*` y `tech-debt`), plantilla de PR con el checklist de la Definition of Done, y `CODEOWNERS` para que las revisiones se pidan automáticamente.

## Versiones fijadas del stack

Verificadas el 2026-09-15.

| Herramienta    | Versión                  | Notas                                                                                    |
| -------------- | ------------------------ | ---------------------------------------------------------------------------------------- |
| Node.js        | 24.21.0 (LTS "Krypton")  | Node 26 aún no es LTS                                                                    |
| pnpm           | 12.4.2                   | Workspaces                                                                               |
| Turborepo      | 2.10.13                  | Orquestación y caché de tareas                                                           |
| TypeScript     | 6.0.3                    | Modo `strict`. **No se usa 7.x** porque `typescript-eslint` 8.70 solo soporta `<6.1.0`   |
| ESLint         | 10.10.0                  | Flat config con `typescript-eslint` 8.70.0 (reglas `strictTypeChecked`)                  |
| Prettier       | 3.9.6                    |                                                                                          |
| husky          | 9.1.7                    | Hooks de Git                                                                             |
| lint-staged    | 17.5.1                   | Lint y formato solo sobre archivos en stage                                              |
| commitlint     | 21.2.2                   | `@commitlint/config-conventional` con `scope-enum` por módulo                            |
| gitleaks       | 8.30.1                   | Detección de secretos en pre-commit (y en CI desde H0.6)                                 |
| NestJS         | 12.0.2                   | ESM; CLI 12.0.1. Pruebas con SWC (`unplugin-swc`) para la metadata de decoradores        |
| Next.js        | 16.3.5                   | App Router, `output: 'standalone'` para Docker; React 19.3.0                             |
| Tailwind CSS   | 4.3.3                    | Vía `@tailwindcss/postcss`                                                               |
| Vitest         | 5.0.0                    | API en entorno `node` (+ supertest); web con `jsdom` y Testing Library                   |
| Prisma         | 7.10.0                   | Generador `prisma-client` (ESM) + `@prisma/adapter-pg`. No 8.x: aún es release candidate |
| PostgreSQL     | 18.6 (`18.6-alpine3.24`) | Imagen usada en pruebas de integración y desarrollo                                      |
| Testcontainers | 12.1.0                   | `@testcontainers/postgresql` para integración                                            |

Las versiones de Playwright, Cucumber, Stryker, etc. se registrarán aquí al incorporarlas.

## Convenciones

- Código, identificadores y commits en **inglés**; interfaz, documentación y escenarios Gherkin en **español**.
- Commits con [Conventional Commits](https://www.conventionalcommits.org/es/) y scope del módulo, p. ej. `feat(credit-cards): compute payment due date`.
- GitHub Flow: ramas cortas y PR obligatorio hacia `main`.
