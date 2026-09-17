# @sol-a-sol/domain

Lógica de negocio **pura** de Sol a Sol: value objects y cálculos. No depende de NestJS, Prisma, React ni de APIs de Node o del navegador, así que se puede probar con TDD y mutation testing sin levantar nada.

## Reglas (verificadas automáticamente)

| Regla                                                             | Cómo se hace cumplir                                                       |
| ----------------------------------------------------------------- | -------------------------------------------------------------------------- |
| Sin frameworks ni base de datos                                   | ESLint `no-restricted-imports` (`@nestjs/*`, `@prisma/*`, `next`, `react`) |
| Sin APIs de Node ni del navegador                                 | `tsconfig.json` con `"types": []` + ESLint (`node:*`)                      |
| Determinista: nunca `new Date()`, `Date.now()` ni `Math.random()` | ESLint `no-restricted-syntax` (también en las pruebas)                     |
| Cobertura ≥ 90 % (líneas, ramas, funciones, sentencias)           | Umbrales en `vitest.config.ts`: `pnpm test` falla por debajo               |
| Mutation score ≥ 80 %                                             | `break` en `stryker.config.json`: `pnpm test:mutation` falla por debajo    |

Las reglas de negocio (dinero, fechas, monedas) están en [`CLAUDE.md`](../../CLAUDE.md).

## Contenido

| Módulo                  | Qué es                                                                                             |
| ----------------------- | -------------------------------------------------------------------------------------------------- |
| `errors/domain-error`   | Base de los errores de negocio, con un `code` estable en inglés                                    |
| `currency/currency`     | Monedas soportadas (`PEN`, `USD`) y su validación                                                  |
| `money/money`           | `Money`: montos exactos con `decimal.js`, operaciones, repartos sin perder céntimos y porcentajes  |
| `money/parse-amount`    | `parseAmount` (texto que es solo un monto) y `findAmountInText` (monto dentro de una notificación) |
| `errors/describe-value` | Describe el valor rechazado en los mensajes de error                                               |

## Comandos

```bash
pnpm --filter @sol-a-sol/domain test          # unitarias + cobertura con umbrales
pnpm --filter @sol-a-sol/domain test:watch    # ciclo TDD
pnpm --filter @sol-a-sol/domain test:mutation # Stryker (reporte en reports/mutation/index.html)
pnpm --filter @sol-a-sol/domain build         # dist/ con declaraciones de tipos
```

## TDD

Todo lo que entra aquí se escribe **prueba primero** (Red → Green → Refactor). Una prueba que sobrevive a una mutación indica un comportamiento sin especificar: se agrega el caso que la mata, no se baja el umbral.
