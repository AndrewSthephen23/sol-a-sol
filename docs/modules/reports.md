# Módulo Reportes (`reports`)

> Ficha del módulo. Estado: **en construcción** (hito H4). Hoy da el **dashboard del mes** por la API; la pantalla llega con la tarea 08. Flag **apagado**. El resumen mensual y el anual llegan en H6.

## Qué resuelve

Seguir el mes día a día: cuánto entró, cuánto se gastó y en qué, y cómo va el saldo. El presupuesto dice si se cumple lo planeado; el dashboard dice qué está pasando, aunque no se haya planeado nada.

## Reglas de negocio

Decididas con el autor el **2026-09-29** (decisiones 8 a 10 de H4):

| Tema            | Regla                                                                                                                                                                                                               |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| KPIs            | Ingresos, gastos, ahorro, deuda y saldo, **por moneda**. Gasto = fijo + variable; ahorro = ahorro + inversión; el saldo es ingresos menos todo lo demás (las mismas reglas de todo el producto: `totalsByCurrency`) |
| Gasto diario    | **Solo gasto (fijo + variable)**, una serie por moneda, **con los días sin gasto en cero**. Un mes pasado tiene todos sus días; el mes en curso llega **hasta hoy en Lima**; uno que no empezó no tiene días        |
| Dona            | Gasto por **categoría madre** (sumando sus hijas), de mayor a menor: las **6** primeras y el resto en **«Otras»**, una por moneda. La parte de cada una es `percentageOf` del gasto del mes, sin redondear          |
| Tablas por tipo | Cada tipo con sus categorías madre, de mayor a menor, y su total                                                                                                                                                    |
| Presupuesto     | **No** aparece en el dashboard: vive en su pantalla (2026-09-29)                                                                                                                                                    |
| Dónde se ve     | El dashboard **reemplaza la página de inicio `/`** (manifest `dashboard`), así que `reports` **no está en el registro de navegación**: un enlace a `/reports` apuntaría a nada                                      |

**Nunca se convierte moneda. Sin transferencias ni transacciones borradas.** Empates en el orden se resuelven por categoría, para que nada salte de lugar entre una carga y otra.

**En el dominio:** `buildMonthlyDashboard` (`packages/domain/src/reports/`, mutation testing al 100 %). El caso de uso solo junta los datos: lo real de `transactions` (`TransactionsLookup`) y las categorías de `catalog` (`CatalogLookup`), por su API pública, para subir lo de cada hija a su madre.

## Modelo de datos

**Ninguno**: `reports` es solo lectura y se calcula al consultar (sección 6.3 del plan).

## Eventos de dominio

- **Emite:** nada.
- **Escucha:** nada.

## Endpoints

Exige una sesión (un token personal recibe 403), filtra por el `userId` del token y responde **404** con el flag apagado. Detalle en `/api/v1/openapi.json`.

| Método | Ruta                            | Qué hace                                                                                                                       |
| ------ | ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `GET`  | `/reports/monthly?year=&month=` | El dashboard del mes en una llamada: por moneda, `kpis`, `daily`, `distribution` y `byType`. Sin movimientos, `currencies: []` |

Montos como **string decimal**; la parte de la dona (`share`) como string **sin redondear** (la web muestra 2 decimales). Un mes que no existe responde **422** (`INVALID_LOCAL_DATE`).

## Estado

- Feature flag: `FEATURE_REPORTS` (**apagado** hasta cumplir la Definition of Done).
- Escenarios: [`features/reports/`](../../features/reports/), `@pendiente` hasta la tarea 09.
