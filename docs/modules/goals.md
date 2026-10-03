# Módulo Metas (`goals`)

> Ficha del módulo. Estado: **en construcción** (hito H6). Hoy existen el módulo y sus tablas; las reglas, los endpoints y la pantalla llegan con las tareas siguientes. Flag **apagado**.

## Qué resuelve

Ahorrar **para algo**: un viaje, un fondo de emergencia, una laptop. Para cada meta se sabe **cuánto va, cuánto falta, cuánto aportar al mes para llegar y si se va a llegar a tiempo**. Es la sección de metas del plan. El ahorro ya se registra como transacción (H3), pero sin este módulo no se sabe a qué se destina ni si alcanza.

## Reglas de negocio

Decididas con el autor el **2026-10-03**:

| Tema                    | Regla                                                                                                                                                                                                                                                |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Qué es un aporte        | **Manual** (fecha y monto) u, opcionalmente, **enlazado** a una transacción de ahorro o inversión. El enlazado **toma la transacción entera y la sigue**: si se corrige, cambia; si se borra, deja de contar. Una transacción aporta a una sola meta |
| Moneda                  | **Una sola por meta**; sus aportes van en ella y **nunca se convierte**. Una meta en dólares no acepta enlazar una transacción en soles, ni al revés                                                                                                 |
| Retiros                 | **Se permiten**, cuando se saca plata del ahorro: monto **positivo** con tipo `WITHDRAWAL`, que resta al avance. **Un retiro es siempre manual**: no se enlaza a una transacción                                                                     |
| Aporte mensual sugerido | Faltante ÷ meses que quedan, **contando el mes en curso**, **redondeado hacia arriba al céntimo**: aportando lo sugerido nunca te quedas corto. Con la fecha fin pasada **no hay sugerido**                                                          |
| Estados                 | **En curso**, **en riesgo** (avance real **más de 10 puntos** por debajo del esperado si se aportara parejo desde el inicio), **cumplida** y **vencida** (fecha fin pasada sin cumplir)                                                              |
| Pasarse de la meta      | **Se permite.** Se muestra el porcentaje real (más de 100 %) y el excedente; la barra se llena al 100 % y la meta queda cumplida                                                                                                                     |
| Fechas                  | **Libres** (una meta a 3 años vale), con el fin **después** del inicio. **El inicio puede ser pasado**, para registrar una meta que ya venías cumpliendo. Un aporte con fecha futura **se rechaza**, como una transacción                            |
| Editar una meta         | Se pueden cambiar el objetivo y las fechas aunque tenga aportes: **todo se recalcula**, porque el progreso se calcula al consultar                                                                                                                   |
| Nombre                  | **Único por cuenta sin distinguir mayúsculas**, contando las archivadas, como el alias de un método de pago                                                                                                                                          |
| Terminar una meta       | **Solo se archiva, a mano** (se conserva el historial y se puede desarchivar). Una meta cumplida **no** se archiva sola. No se borra                                                                                                                 |
| Dónde se ve             | **«Metas»** (`/goals`) en el menú                                                                                                                                                                                                                    |

## Modelo de datos

| Tabla                | Qué guarda                                                                                                                                                                                          |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `savings_goals`      | Una meta: nombre, objetivo (`NUMERIC(18,2)`, > 0) y su moneda, fecha de inicio y de fin (`DATE`) y si está archivada                                                                                |
| `goal_contributions` | Un aporte o un retiro (`kind`). Manual: con fecha (`DATE`) y monto (`NUMERIC(18,2)`, > 0). Enlazado: solo el `transaction_id`, sin fecha ni monto propios. La moneda no se guarda: es la de la meta |

Lo que va, lo que falta, el aporte sugerido y el estado **no se guardan**: se calculan al consultar con los aportes (y, en los enlazados, con la transacción como está hoy).

La base exige por su cuenta, aunque alguien se salte la aplicación:

- **El aporte es de la misma cuenta que su meta y que su transacción**: `goal_contributions` lleva su propio `user_id` y claves foráneas compuestas `(goal_id, user_id)` y `(transaction_id, user_id)`, como `installment_plans` en H5.
- **Un aporte manual lleva fecha y monto; uno enlazado, ninguno de los dos, y es siempre `CONTRIBUTION`** (`CHECK`).
- El objetivo y los montos son mayores que cero; el fin va después del inicio; el nombre no está vacío y es único por cuenta sin distinguir mayúsculas (`CHECK` e índice único).
- **Una transacción, a lo más un aporte** (`transaction_id` único).
- Borrar una meta borra sus aportes; borrar una cuenta borra metas y aportes (los dos cuelgan **directo** de su usuario, lección de H4). Una transacción enlazada **no se puede borrar del todo** (las transacciones solo se borran de forma lógica).

Que la transacción enlazada sea de ahorro o inversión y de la moneda de la meta no lo puede exigir la base sin cruzar módulos (y la transacción se puede corregir después): lo valida el caso de uso con `TransactionsLookup`.

## Eventos de dominio

- **Emite:** nada todavía.
- **Escucha:** nada.

## Endpoints

Llegan con la tarea 03 (`GET/POST/PATCH /goals` y los aportes).

## Estado

- Feature flag: `FEATURE_GOALS` (**apagado** hasta cumplir la Definition of Done).
- Escenarios: [`features/goals/`](../../features/goals/), `@pendiente` hasta la tarea 11.
- Web: el manifest (`/goals`) está en el registro de navegación y no se ve con el flag apagado; la pantalla llega con la tarea 04.
