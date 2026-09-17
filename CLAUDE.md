# CLAUDE.md

Contexto y reglas del dominio que **no se deducen leyendo el código**. El proceso de trabajo (ramas, commits, PR, pruebas, Definition of Done) está en [`CONTRIBUTING.md`](CONTRIBUTING.md); las decisiones de arquitectura, en [`docs/adr/`](docs/adr/).

## Qué es esto

**Sol a Sol** es una plataforma web personal (PWA instalable) para ordenar las finanzas y avanzar hacia la libertad financiera. Contexto: Perú, moneda principal PEN (`S/`) y secundaria USD, zona horaria `America/Lima`, interfaz en español. Hoy la usa una sola persona, pero **el modelo de datos es multiusuario desde el día 1**: toda tabla de negocio lleva `userId`.

Cada funcionalidad entra **con** su capa de calidad (pruebas, documentación, seguridad), nunca después.

## Reglas no negociables

1. **Nunca `number` para dinero.** Se usa el value object `Money { amount: Decimal; currency: 'PEN' | 'USD' }`:
   - Los cálculos conservan toda la precisión; el **redondeo bancario (half-even) a 2 decimales** se aplica solo al presentar o persistir (`toFixed()`).
   - Sumar o comparar monedas distintas lanza error.
   - Un monto de entrada con **más de 2 decimales se rechaza** (no se redondea en silencio: suele ser un dato mal leído).
   - Los repartos (cuotas) usan `allocate`, que no pierde céntimos: **los céntimos sobrantes van a las primeras partes** (S/ 100.00 en 3 → 33.34, 33.33, 33.33).
   - Los porcentajes (`percentageOf`) se calculan sin redondear y **se muestran con 2 decimales** (36.67 %); con base cero no hay porcentaje (`null`).
   - **Textos con montos:** `parseAmount` interpreta un texto que solo contiene el monto (`"S/ 1,234.50"`, `"US$ 20"`). Solo acepta **punto decimal** con coma de miles, el formato peruano; `1.234,50` se rechaza por ambiguo en vez de adivinar. Un `$` suelto es **USD** (los soles se escriben `S/`). Si el texto no trae moneda, **la indica quien llama** (`defaultCurrency`): el dominio no supone soles.
   - **Notificaciones completas:** `findAmountInText` extrae el monto de un texto libre, pero solo si está **pegado a una moneda**, para no confundirlo con los últimos dígitos de la tarjeta, una fecha o el número de cuotas. Si hay montos distintos no elige: la captura va a la bandeja de revisión.
2. **Nunca `new Date()` en la lógica de dominio.** El "hoy" entra como parámetro o por un puerto `Clock`.
3. **Montos de transacción siempre positivos**; el signo lo determina el tipo de transacción. `Money` sí admite negativos, porque diferencias y saldos pueden serlo (presupuesto S/ 500 − gasto S/ 550 = −S/ 50): la regla se valida en la transacción, no en el dinero.
4. **Fechas de negocio sin hora** (`LocalDate`); los timestamps técnicos (`createdAt`) en UTC.
5. **Toda consulta filtra por `userId`** del token, y cada endpoint nuevo lleva una **prueba de acceso denegado** a recursos ajenos (anti-IDOR).
6. **Nunca datos sensibles de tarjetas:** solo alias, banco y últimos 4 dígitos. Jamás número completo, CVV ni fecha de vencimiento.
7. **Nunca secretos** en código, fixtures, logs, Dockerfiles ni compose. Si agregas una variable de entorno, actualiza el `.env.example` correspondiente.
8. **Nunca edites una migración ya aplicada:** crea una nueva.
9. **La lógica de cálculo vive en `@sol-a-sol/domain`**, pura y determinista, con TDD.

## Fronteras entre módulos

Monolito modular con arquitectura hexagonal ([ADR-0001](docs/adr/0001-monolito-modular.md)):

```
apps/api/src/modules/<modulo>/
├── domain/          # entidades y reglas
├── application/     # un caso de uso por clase
├── ports/           # interfaces: repositorios, Clock, notificadores
├── infrastructure/  # adaptadores: Prisma, HTTP externos
└── http/            # controllers, DTOs, OpenAPI
```

- `domain` no importa nada externo (ni NestJS, ni Prisma, ni otros módulos).
- `application` depende de `domain` y `ports`, nunca de `infrastructure`.
- `http` e `infrastructure` dependen de `application`.
- **Un módulo no importa el interior de otro:** se comunican por la API pública del módulo (su `index.ts`) o por **eventos de dominio**.

Módulos de la fase 1: `identity`, `catalog`, `transactions`, `budgeting`, `credit-cards`, `goals`, `reports`, `capture`. Fases posteriores (no implementar aún): `investments-us`, `funds`, `investments-pe`, `retirement`.

## Convenciones de la API

- Base `/api/v1`; los cambios incompatibles van a `/api/v2`. `/health` y `/health/ready` quedan **fuera** del prefijo.
- JSON en camelCase; **los montos viajan como string decimal** (`"1234.50"`), nunca como número.
- Errores con **Problem Details (RFC 9457)**: `type`, `title`, `status`, `detail`, `errors[]`.
- Paginación por cursor (`?cursor=&limit=`); validación de entrada con esquemas Zod compartidos.

## Idioma

- **Código, identificadores, nombres de archivo y commits: inglés.**
- **Interfaz, documentación, comentarios y escenarios Gherkin: español.**
- Equivalencias en el [glosario](docs/glosario.md). Los enums van en inglés.

## Si algo no está definido, pregunta

Este proyecto se construye mientras el autor aprende finanzas. Ante una regla de negocio ambigua (un redondeo, un caso borde, qué pasa en un mes corto), **pregunta antes de asumir**: una suposición silenciosa se convierte en un cálculo equivocado difícil de detectar.
