# Módulo Presupuesto (`budgeting`)

> Ficha del módulo. Estado: **en construcción** (hito H4). La API está completa: leer y guardar el mes con lo real al lado, copiar el mes anterior y seguir las fusiones de categorías. La pantalla llega con la tarea 07. Flag **apagado**.

## Qué resuelve

Planear el mes y seguirlo: cuánto va a cada categoría, cuánto se lleva y cuánto queda. Es la sección «Arma tu Presupuesto» del plan. Sin presupuesto, las transacciones dicen en qué se fue la plata, pero no si era lo que se quería.

## Reglas de negocio

Decididas con el autor el **2026-09-29**:

| Tema                    | Regla                                                                                                                                                                                                              |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Qué se presupuesta      | **Todos los tipos**: ingreso, gasto fijo, gasto variable, ahorro, inversión y deuda                                                                                                                                |
| Dónde va la partida     | **Solo en la categoría madre**. Suma lo real de la madre **y de todas sus hijas**, como el filtro de la lista de transacciones                                                                                     |
| Moneda                  | **Una partida por categoría y moneda**: «Comida» puede tener S/ 800 y US$ 50 el mismo mes. Cada una compara solo con lo real en su moneda; **nunca se convierte**                                                  |
| Límites                 | Gasto fijo, gasto variable **y deuda**. Diferencia = **planeado − real** (positivo: lo disponible; negativo: cuánto me pasé). **Excedida** apenas real > planeado, sin tolerancia                                  |
| Metas                   | Ingreso, ahorro e inversión se leen al revés: lo bueno es llegar o pasarse                                                                                                                                         |
| Monto cero              | **Permitido**: marca «aquí no gastar nada». Cualquier gasto la deja excedida y el % ejecutado no existe (`null`, se muestra «—»): nunca se divide por cero                                                         |
| Sin presupuesto         | Lo real de las categorías sin partida va en una fila **«Sin presupuesto»** por tipo, y **cuenta** en el total real del tipo                                                                                        |
| Copiar del mes anterior | **Solo completa lo que falta**, nunca pisa una partida. Si el mes anterior está vacío, usa el **último mes con presupuesto**. Las categorías archivadas **no se copian** y la respuesta dice cuáles quedaron fuera |
| Qué meses               | **Cualquiera**, pasado o futuro, como las transacciones: no hay mes cerrado                                                                                                                                        |

**En el dominio** (`packages/domain/src/budgeting/`, mutation testing al 100 %):

- `budgetKind(type)`: `LIMIT` (gasto fijo, gasto variable, deuda) o `GOAL` (ingreso, ahorro, inversión).
- `computeBudgetVariance(type, planeado, real)`: diferencia con «lo bueno es positivo» (límite: planeado − real; meta: real − planeado), `executed` = real sobre planeado **sin redondear** (`null` con planeado en cero) y el estado: `WITHIN`/`EXCEEDED` para un límite, `PENDING`/`MET` para una meta. Monedas distintas lanzan error.
- `summarizeBudget(partidas, real)`: por tipo y moneda, cada partida con lo real de su categoría, la fila «Sin presupuesto» (de mayor a menor) y el total del tipo, que incluye lo sin presupuesto.
- Reglas de una partida: `assertPlannedAmount` (cero o más), `assertBudgetableCategory` (madre y activa), `assertBudgetLines` (una por categoría y moneda), `assertBudgetMonth` (mes 1–12, años 2000–2100).

| Código                          | Cuándo                                                                      |
| ------------------------------- | --------------------------------------------------------------------------- |
| `BUDGET_AMOUNT_NEGATIVE`        | Un monto planeado negativo                                                  |
| `BUDGET_CATEGORY_NOT_TOP_LEVEL` | Una partida en una subcategoría                                             |
| `BUDGET_LINE_DUPLICATED`        | Dos partidas de la misma categoría y moneda                                 |
| `BUDGET_MONTH_INVALID`          | Un mes fuera de 1–12 o un año fuera de 2000–2100                            |
| `CATEGORY_ARCHIVED`             | Una partida en una categoría archivada (el mismo error que una transacción) |

**Qué es gasto y qué es ahorro** no se redefine aquí: gasto es fijo + variable y ahorro es ahorro + inversión (`countsAsExpense` y `countsAsSaving` del dominio, decididos en H3). Las **transferencias no cuentan**.

## Modelo de datos

| Tabla          | Qué guarda                                                                                                                                                     |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `budgets`      | Un presupuesto por **mes y cuenta** (único `(user_id, year, month)`). `year` y `month` son enteros (el mes, 1 a 12): un presupuesto es de un mes, no de un día |
| `budget_lines` | Una partida: categoría madre, tipo, monto planeado (`NUMERIC(18,2)`, **≥ 0**) y moneda. Única `(budget_id, category_id, currency)`                             |

La base exige por su cuenta, aunque alguien se salte la aplicación:

- **Una partida es de la misma cuenta que su presupuesto y que su categoría**: `budget_lines` lleva su propio `user_id` para que las claves foráneas compuestas `(budget_id, user_id)` y `(category_id, user_id, type)` lo garanticen.
- **El tipo de la partida es el de su categoría.**
- El mes está entre 1 y 12 y el monto planeado no es negativo (`CHECK`).
- Borrar un presupuesto borra sus partidas, y borrar una cuenta borra sus presupuestos y partidas (la partida cuelga **directo** de su usuario, como una transacción). Una categoría con partidas **no se puede borrar** (se archiva, como con las transacciones).

Que la categoría sea **madre** no lo puede exigir la base sin cruzar módulos: lo valida el dominio.

## Eventos de dominio

- **Emite:** nada todavía.
- **Escucha:** `catalog.category.merged` (ADR-0005). Las partidas de la categoría fusionada pasan a la destino **en todos los meses**, en una sola transacción; si la destino ya tenía partida ese mes y en esa moneda, **se suman** (2026-09-29). Al convertir una subcategoría en etiqueta no hay nada que mover: las partidas van solo en madres. Si el oyente falla, la fusión sigue (ADR-0004) y volver a fusionar las mueve.

## Endpoints

Todos exigen una sesión (un token personal recibe 403), filtran por el `userId` del token y responden **404** con el flag apagado. El año y el mes de la ruta dicen **qué** mes, nunca de quién. Detalle en `/api/v1/openapi.json`.

| Método | Ruta                                         | Qué hace                                                                                                                             |
| ------ | -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `GET`  | `/budgets/{year}/{month}`                    | Las partidas del mes. **Un mes sin presupuesto responde 200 con `lines: []`**, no 404                                                |
| `PUT`  | `/budgets/{year}/{month}`                    | Guarda el mes **entero**: la lista reemplaza a la anterior (`[]` lo vacía), toda o nada                                              |
| `POST` | `/budgets/{year}/{month}/copy-from-previous` | Copia las partidas que el mes no tiene, del mes anterior o del último con presupuesto. Responde **200** con `copiedFrom` y `skipped` |

Cada partida viaja como `{ categoryId, plannedAmount, currency }`, con el monto como **string decimal**; la respuesta agrega el `type` de su categoría. Una categoría ajena o inexistente responde **404** (`CATEGORY_NOT_FOUND`); las reglas rotas, **422** con su código.

**Una partida que el mes ya tenía se puede volver a mandar aunque su categoría se haya archivado después**: corregir un mes pasado no obliga a borrarla, igual que al corregir una transacción. Una partida **nueva** sí exige una categoría activa.

**Lo real al lado de lo planeado** (tarea 04): las dos respuestas traen `summary`, por tipo y moneda, con cada partida (`planned`, `actual`, `difference`, `executed`, `status`), la fila `unbudgeted` («Sin presupuesto», de mayor a menor) y el `total` del tipo, que incluye lo sin presupuesto. Los montos van como string decimal y `executed` como string **sin redondear** (la web muestra 2 decimales), o `null` con lo planeado en cero.

- **Lo real de una subcategoría suma en su madre**, donde va la partida.
- **Solo el mes pedido**, del día 1 al último; el mes en curso llega hasta hoy porque una transacción nunca es futura.
- **Sin transferencias ni transacciones borradas**, y **nunca se convierte moneda**: lo gastado en dólares va a su propio bloque, aunque la categoría tenga partida en soles.
- Lo real sale de `transactions` por su API pública (`TransactionsLookup`), nunca de sus tablas.

**Copiar del mes anterior** (tarea 05): solo completa lo que falta y **nunca pisa** una partida (misma categoría y moneda); si el mes anterior está vacío, copia del **último mes con presupuesto** (un mes posterior nunca es «anterior»); las categorías archivadas **no se copian** y van en `skipped`, para que no desaparezcan en silencio. **Sin ningún mes anterior con presupuesto responde 200 con `copiedFrom: null`**: no es un error (2026-09-29). Todo se escribe de una vez.

## Estado

- Feature flag: `FEATURE_BUDGETING` (**apagado** hasta cumplir la Definition of Done).
- Escenarios: [`features/budgeting/`](../../features/budgeting/), `@pendiente` hasta la tarea 09.
- Web: el manifest (`/budgeting`) está en el registro de navegación y no se ve con el flag apagado; la pantalla llega con la tarea 07.
