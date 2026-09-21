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
   - Un instante se convierte a fecha de negocio **siempre con una zona explícita**, normalmente `America/Lima`: a las 21:30 de Lima ya es el día siguiente en UTC, y el gasto quedaría en el día equivocado.
   - **Día de corte que no existe en el mes:** se ajusta al último día (un corte 31 cierra el 30 de abril y el 28 o 29 de febrero). Lo mismo al sumar meses.
   - **Sin ajuste por fines de semana ni feriados:** un vencimiento que cae domingo se queda en domingo. Mover al siguiente día hábil exigiría mantener el calendario de feriados de Perú; se evaluará cuando haga falta.
   - **Fechas escritas como texto:** ISO (`2026-09-17`) por defecto; el formato peruano (`17/09/2026`) solo cuando quien llama sabe que el origen lo usa, porque `03/04/2026` es ambiguo.
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

**Módulo nuevo:** `pnpm gen:module <nombre>` crea el esqueleto y lo registra (navegación, `AppModule`, `.env.example`, commitlint). No se crea a mano.

**Feature flags.** Un módulo en construcción se integra a `main` **apagado**: se activa solo si su variable vale exactamente `true` (`FEATURE_BUDGETING=true`); cualquier otro valor lo deja apagado. En la API, las rutas del módulo llevan `@RequiresFeature('<modulo>')` y responden **404** cuando está apagado (un 403 confirmaría que existe). En la web, cada funcionalidad declara su `manifest` (`id`, `title`, `route`, `icon`, `flag`) y la navegación se arma leyendo el registro: **no se edita el layout** para agregar un módulo.

## Convenciones de la API

- Base `/api/v1`; los cambios incompatibles van a `/api/v2`. `/health` y `/health/ready` quedan **fuera** del prefijo.
- JSON en camelCase; **los montos viajan como string decimal** (`"1234.50"`), nunca como número.
- Errores con **Problem Details (RFC 9457)**: `type`, `title`, `status`, `detail`, `errors[]`.
  - `type` es un **URN estable**, no una URL: `urn:sol-a-sol:error:invalid-amount`. No promete una página que haya que mantener viva.
  - `title` y `detail` van **en inglés**, para quien depura. La interfaz en español la arma la web traduciendo el `code`, que es estable y no se cambia sin pensarlo.
  - Cada elemento de `errors[]` es `{ field, code, message }`, con `field` como ruta con puntos (`card.last4`).
  - Un error inesperado responde **500 genérico**: nunca salen stack traces ni mensajes de la base de datos.
- Paginación por cursor (`?cursor=&limit=`); validación de entrada con esquemas Zod de `@sol-a-sol/contracts`, que describen **la forma** del mensaje; la política de negocio se queda en el dominio.

- **OpenAPI** en `/api/v1/openapi.json`, generado desde los mismos esquemas Zod con los que la API valida, así que no puede desincronizarse. Un módulo con su feature flag apagado **no aparece** en el documento: describirlo confirmaría justo lo que su 404 oculta. Una prueba comprueba que toda ruta registrada esté documentada y que no se documente ninguna que no exista.

**Agregar un error nuevo:**

1. Si lo provoca una regla de negocio, crea la clase en `@sol-a-sol/domain` heredando de `DomainError`, con un `code` en inglés y `UPPER_SNAKE_CASE` (`PASSWORD_TOO_SHORT`). Lánzala desde el dominio o el caso de uso: el filtro global la traduce sola.
2. Por defecto responde **422**. Si ese error significa otra cosa (por ejemplo, "no encontrado"), agrega su `code` al mapa `STATUS_BY_DOMAIN_CODE` de `problem-details.filter.ts`.
3. Si la web debe mostrarlo, agrega la traducción del `code` al español allí. Nunca mandes el texto en español desde la API.

## Idioma

- **Código, identificadores, nombres de archivo y commits: inglés.**
- **Interfaz, documentación, comentarios y escenarios Gherkin: español.**
- Equivalencias en el [glosario](docs/glosario.md). Los enums van en inglés.

## Si algo no está definido, pregunta

Este proyecto se construye mientras el autor aprende finanzas. Ante una regla de negocio ambigua (un redondeo, un caso borde, qué pasa en un mes corto), **pregunta antes de asumir**: una suposición silenciosa se convierte en un cálculo equivocado difícil de detectar.
