# ADR-0002: TypeScript de punta a punta en un monorepo

- **Estado:** Aceptada
- **Fecha:** 2026-09-15
- **Hito:** H0

## Contexto

El proyecto necesita una web instalable en el teléfono (PWA), una API con autenticación y una base de datos relacional, todo mantenido por una sola persona que además aplica el curso de Calidad de Software: TDD, BDD, CI/CD y análisis estático.

El riesgo principal del dominio es la **exactitud de los cálculos** (dinero, ciclos de facturación, cuotas, presupuestos). El segundo es la **duplicación de contratos** entre frontend y backend: si los tipos y las validaciones se escriben dos veces, se desincronizan.

## Decisión

**Un solo lenguaje, TypeScript en modo `strict`, en todo el repositorio**, organizado como monorepo con pnpm workspaces y Turborepo.

| Capa          | Elección                                                                               |
| ------------- | -------------------------------------------------------------------------------------- |
| Frontend      | Next.js (App Router) + Tailwind CSS, instalable como PWA                               |
| API           | NestJS (módulos, inyección de dependencias, guards)                                    |
| Dominio       | Paquete TS puro `@sol-a-sol/domain`, sin framework ni ORM                              |
| Contratos     | Esquemas Zod compartidos + OpenAPI generado desde NestJS                               |
| Base de datos | PostgreSQL con Prisma (migraciones versionadas en Git)                                 |
| Dinero        | `decimal.js` encapsulado en un value object `Money`                                    |
| Fechas        | `date-fns` + `date-fns-tz`, siempre con zona `America/Lima`                            |
| Pruebas       | Vitest (unitarias e integración), Playwright (E2E), Cucumber (BDD), Stryker (mutación) |

Reglas no negociables que derivan de esta decisión:

- **Prohibido `number` para dinero**; se usa `Money` con redondeo bancario a 2 decimales y `allocate` para repartir cuotas sin perder céntimos.
- **Prohibido `new Date()` en la lógica de dominio**; el "hoy" entra como parámetro o por un puerto `Clock`, para que las pruebas sean deterministas.
- Las versiones exactas del stack se registran en el `README.md` y se fijan (`packageManager`, `.nvmrc`, lockfile, imágenes por digest).

## Consecuencias

**Positivas**

- Los tipos y las validaciones se escriben una vez y se comparten entre web y API; el cliente HTTP se genera desde OpenAPI.
- Una sola cadena de herramientas (ESLint, Prettier, Vitest) para todo el repositorio.
- Turborepo cachea tareas por paquete, así que CI solo repite lo que cambió.
- El dominio, al no depender de framework ni base de datos, se presta a TDD y a mutation testing.

**Negativas y riesgos**

- TypeScript no valida en tiempo de ejecución: toda entrada externa (HTTP, capturas del teléfono, CSV) debe validarse con Zod.
- El ecosistema se mueve rápido y obliga a decisiones de compatibilidad. Ya ocurrió: **TypeScript se fija en 6.x porque `typescript-eslint` todavía no soporta 7.x**, y la web no usa `eslint-config-next` porque arrastra un plugin incompatible con ESLint 10.
- Un monorepo concentra el riesgo de la cadena de suministro: se mitiga con `minimumReleaseAge` de pnpm, scripts de instalación aprobados uno por uno, `pnpm audit` y Dependabot.
- Node.js en la API no es ideal para cálculo intensivo; no es un problema en esta escala (un usuario, reportes mensuales y anuales).

## Alternativas consideradas

| Alternativa                                                 | Por qué se descartó                                                                                                                                                      |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **API en Python (FastAPI) + frontend en TS**                | Dos lenguajes, dos cadenas de herramientas y contratos duplicados; el beneficio no compensa para una persona.                                                            |
| **Java/Kotlin (Spring Boot)**                               | Más ceremonia y consumo de memoria del que justifica un proyecto personal; peor integración con el frontend.                                                             |
| **Backend as a Service (Supabase/Firebase) sin API propia** | La lógica financiera terminaría en el cliente o en funciones dispersas, difícil de probar con TDD y de aislar en un dominio puro; además ata el proyecto a un proveedor. |
| **Sin monorepo (repos separados)**                          | Versionar y sincronizar contratos entre repos cuesta más que la complejidad del monorepo.                                                                                |
