# Sol a Sol

Plataforma personal para ordenar mis finanzas y avanzar hacia la libertad financiera, sol a sol. Presupuesto, gastos, tarjetas y metas de ahorro, con captura desde el celular. Construida con calidad de software: TDD, BDD, CI/CD y Docker.

> Proyecto de aplicación del curso [Calidad de Software](https://ecuadros.github.io/SoftwareQuality/): ISO/IEC 25010, GitHub Flow, TDD, BDD, CI/CD, análisis estático, seguridad y observabilidad.

## Estado

🚧 **Hito H0 — Cimientos** (en curso). Esta versión contiene solo el esqueleto del monorepo y las configuraciones compartidas.

## Requisitos

| Herramienta             | Versión                                          | Cómo              |
| ----------------------- | ------------------------------------------------ | ----------------- |
| Node.js                 | 24.x LTS (recomendada **24.21.0**, ver `.nvmrc`) | `nvm use`         |
| pnpm                    | **12.4.2** (fijada en `packageManager`)          | `corepack enable` |
| Docker + Docker Compose | Se definirá en H0.5                              | —                 |

## Primeros pasos

```bash
nvm use
corepack enable
pnpm install
```

## Comandos

| Comando                             | Qué hace                                    |
| ----------------------------------- | ------------------------------------------- |
| `pnpm build`                        | Compila todos los paquetes (Turborepo)      |
| `pnpm dev`                          | Levanta las apps en modo desarrollo         |
| `pnpm lint`                         | ESLint en todos los paquetes                |
| `pnpm typecheck`                    | Verificación de tipos en todos los paquetes |
| `pnpm test`                         | Pruebas unitarias                           |
| `pnpm format` / `pnpm format:check` | Formatea / verifica formato con Prettier    |

Más comandos (`test:e2e`, `db:migrate`, `gen:module`, etc.) se irán agregando en los hitos siguientes.

## Estructura

```
sol-a-sol/
├── apps/          # web (Next.js PWA) y api (NestJS) — a partir de H0.3
└── packages/
    └── config/    # @sol-a-sol/config: tsconfig, ESLint y Prettier compartidos
```

## Versiones fijadas del stack

Verificadas el 2026-09-15.

| Herramienta | Versión                 | Notas                                                                                  |
| ----------- | ----------------------- | -------------------------------------------------------------------------------------- |
| Node.js     | 24.21.0 (LTS "Krypton") | Node 26 aún no es LTS                                                                  |
| pnpm        | 12.4.2                  | Workspaces                                                                             |
| Turborepo   | 2.10.13                 | Orquestación y caché de tareas                                                         |
| TypeScript  | 6.0.3                   | Modo `strict`. **No se usa 7.x** porque `typescript-eslint` 8.70 solo soporta `<6.1.0` |
| ESLint      | 10.10.0                 | Flat config con `typescript-eslint` 8.70.0 (reglas `strictTypeChecked`)                |
| Prettier    | 3.9.6                   |                                                                                        |

Las versiones de Next.js, NestJS, Prisma, Vitest, etc. se registrarán aquí al incorporarlas.

## Convenciones

- Código, identificadores y commits en **inglés**; interfaz, documentación y escenarios Gherkin en **español**.
- Commits con [Conventional Commits](https://www.conventionalcommits.org/es/) y scope del módulo, p. ej. `feat(credit-cards): compute payment due date`.
- GitHub Flow: ramas cortas y PR obligatorio hacia `main`.
