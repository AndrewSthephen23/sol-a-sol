# Módulo Reportes (`reports`)

> Ficha del módulo. Estado: **publicado en 0.5.0** (cierre de H4): el **dashboard del mes**, en la API y en la página de inicio `/`. Flag **encendido**. En H6 llega el **resumen mensual**: hoy están su dominio y su API (`GET /reports/monthly-summary`); la exportación y la pantalla llegan con las tareas 07 y 08. Después, el anual.

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

## Resumen mensual (H6)

El **cierre** de un mes: el dashboard sirve para seguirlo día a día, el resumen para **evaluarlo**. Decidido con el autor el **2026-10-03** (decisiones 8 a 14 de H6 y las que salieron en la tarea 05):

| Tema                  | Regla                                                                                                                                                                                                                                                                                         |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Qué mes               | Un mes ya cerrado, entero; el mes en curso, **del 1 a hoy**. Un mes que todavía no empieza **no tiene resumen** (`SUMMARY_MONTH_IN_FUTURE`)                                                                                                                                                   |
| Contra qué se compara | Un mes cerrado, contra el anterior **entero**; el mes en curso, contra el anterior **hasta el mismo día** (1–15 set. vs. 1–15 ago.). Si el anterior no tiene ese día, hasta su último día (decisión 8)                                                                                        |
| Totales               | Por tipo (los seis, aunque estén en cero) y saldo, **por moneda**, con las reglas de todo el producto (`totalsByCurrency`). Aparecen las monedas con movimientos en el mes **o en el anterior**                                                                                               |
| Tasa de ahorro        | Ahorro **con inversión** sobre ingresos, por moneda, sin redondear; puede pasar de 100 %. Sin ingresos, `null` («sin ingresos») (decisión 9)                                                                                                                                                  |
| Variación             | Diferencia (ahora − antes) y su % por **tipo** y por **categoría madre** (sumando sus hijas), sin subcategorías. Con base cero no hay %; lo que desaparece es −100 % (decisión 10). Las categorías, por tipo, de mayor a menor ahora y por id                                                 |
| Top 5 categorías      | Las de **gasto** (fijo + variable), de mayor a menor, con su parte del gasto del mes. Empatadas, por id                                                                                                                                                                                       |
| Top 5 comercios       | Solo **gasto**, juntando los que solo difieren en tildes, mayúsculas o espacios (`searchKey`); se nombran como se escribieron **más veces** (empate: el primero en orden de código). Sin comercio, fuera. Por moneda (decisión 11)                                                            |
| Presupuesto           | Solo las partidas **límite** (gasto fijo, variable y deuda): el % ejecutado por moneda (todo lo real de esos tipos, también lo gastado sin partida, como en H4) y las partidas **excedidas**, la más excedida primero. Sin partidas límite, **«sin presupuesto»**, no se oculta (decisión 12) |
| Tarjetas              | Lo cargado en el **mes calendario** y el estado que **cierra en el mes** con fecha límite de pago **el mes siguiente**, con su deuda al corte y lo que falta. Una archivada aparece solo si se movió (decisión 13)                                                                            |
| Metas                 | Las vivas en el mes (no archivadas, ya empezadas a la fecha de corte y sin terminar antes del mes): **lo aportado en el mes** (aportes − retiros) y su **progreso a la fecha de corte** (2026-10-03)                                                                                          |
| Fecha de corte        | Metas y tarjetas se toman **al cierre del mes** (el último día de un mes cerrado, hoy en el mes en curso): el resumen de agosto dice lo mismo en octubre, salvo que se corrijan movimientos (2026-10-03)                                                                                      |
| Capturas              | **Fuera hasta H7** (decisión 14)                                                                                                                                                                                                                                                              |
| Módulos apagados      | La sección de presupuesto, tarjetas o metas **no aparece**: el resumen no la inventa ni la muestra vacía                                                                                                                                                                                      |

**En el dominio:** `monthlySummaryPeriods` (qué días mira y con cuáles compara) y `computeMonthlySummary` (`packages/domain/src/reports/monthly-summary.ts`, mutation testing al 100 %), que reutilizan `totalsByCurrency`, `summarizeBudget`, `computeBudgetVariance`, `searchKey` y `computeGoalProgress`. El estado de cada tarjeta llega ya calculado.

**En la API:** `GetMonthlySummary` junta los datos, cada uno por la API pública de su módulo y detrás de un **puerto propio** (`useExisting` en `reports.module.ts`): lo real y los comercios de `transactions` (`TransactionsLookup`), las categorías de `catalog` (`CatalogLookup`, para subir cada hija a su madre), las partidas de `budgeting` (`BudgetingLookup`), las tarjetas de `credit-cards` (`CreditCardsLookup`) y las metas de `goals` (`GoalsLookup`). Qué módulos están encendidos lo dice `FeatureFlagsService` detrás del puerto `ReportFeatureFlags`: uno **apagado no se consulta** y su sección no aparece, ni en la respuesta ni en el esquema de OpenAPI, para no delatar lo que su 404 oculta.

## Modelo de datos

**Ninguno**: `reports` es solo lectura y se calcula al consultar (sección 6.3 del plan).

## Eventos de dominio

- **Emite:** nada.
- **Escucha:** nada.

## Endpoints

Exige una sesión (un token personal recibe 403), filtra por el `userId` del token y responde **404** con el flag apagado. Detalle en `/api/v1/openapi.json`.

| Método | Ruta                                    | Qué hace                                                                                                                                                                                                                                                               |
| ------ | --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET`  | `/reports/monthly?year=&month=`         | El dashboard del mes en una llamada: por moneda, `kpis`, `daily`, `distribution` y `byType`. Sin movimientos, `currencies: []`                                                                                                                                         |
| `GET`  | `/reports/monthly-summary?year=&month=` | El cierre del mes: `period` y `previousPeriod`, por moneda `totals`, `savingsRate`, `byType`, `byCategory`, `topCategories` y `topMerchants`, y `budget`, `cards` y `goals` si su módulo está encendido. Un mes que no empezó responde 422 (`SUMMARY_MONTH_IN_FUTURE`) |

Montos como **string decimal**; la parte de la dona (`share`) como string **sin redondear** (la web muestra 2 decimales). Un mes que no existe responde **422** (`INVALID_LOCAL_DATE`).

## Estado

- Feature flag: **`FEATURE_REPORTS=true`** desde el cierre de H4 (0.5.0).
- Escenarios: [`features/reports/`](../../features/reports/), en verde con `pnpm test:bdd`. Corren contra los casos de uso reales, con los fakes de los puertos, y leen lo real de las transacciones que el escenario registra.
- Web: el dashboard vive en `/` (manifest `dashboard`, decisión 10 de H4). Con el flag apagado, `/` muestra la bienvenida en vez de un 404, porque es a donde se llega al entrar.

## Pantalla (web)

`/?month=2026-09`: el mes vive en la URL, con el mismo selector que la lista de transacciones y el presupuesto. Un bloque por moneda, sin convertir nunca:

- **KPIs:** ingresos, gastos, ahorro e inversión, deuda y saldo. **El saldo negativo va en rojo y con su signo**, no solo con color.
- **Gasto por día:** una barra por día (gasto fijo + variable, con los días en cero). Debajo va una frase con el total, los días y el de más gasto, que es la **alternativa en texto** del gráfico. El gráfico va con `aria-hidden`.
- **Gasto por categoría:** la dona con los colores del catálogo («Otras» en gris). Su leyenda es la versión en texto, con el % a 2 decimales (redondeo bancario). **Cada categoría enlaza a sus movimientos del mes** (`/transactions?month=…&categoryId=…`, con sus subcategorías); «Otras» no enlaza.
- **Tablas por tipo:** cada categoría madre con su monto, y el total.

**Recharts y la CSP.** La política no permite `'unsafe-inline'` en estilos, y Recharts pone estilos en línea. Por eso los gráficos se dibujan **solo en el navegador**, después de hidratar (`ClientOnly`): desde ahí los estilos van por CSSOM (`element.style`), que la CSP permite, y nunca llegan en el HTML del servidor. Los colores de las porciones y de la leyenda van como atributo `fill` del SVG, no como `style`. La E2E falla si el navegador bloquea algo.

Los montos llegan como string y se muestran con `formatMoney`. Solo para dibujar la altura de una barra o el ángulo de una porción se pasan a número (`chartNumber`), nunca para mostrar ni para calcular. Como `/` cambia con cada movimiento registrado en otra pantalla, el resumen se vuelve a pedir cada vez que se entra.
