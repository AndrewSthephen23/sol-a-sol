# Módulo Metas (`goals`)

> Ficha del módulo. Estado: **en construcción** (hito H6). Hoy existen el módulo, sus tablas, sus reglas, su API y su pantalla. Flag **apagado**.

## Qué resuelve

Ahorrar **para algo**: un viaje, un fondo de emergencia, una laptop. Para cada meta se sabe **cuánto va, cuánto falta, cuánto aportar al mes para llegar y si se va a llegar a tiempo**. Es la sección de metas del plan. El ahorro ya se registra como transacción (H3), pero sin este módulo no se sabe a qué se destina ni si alcanza.

## Reglas de negocio

Decididas con el autor el **2026-10-03**:

| Tema                    | Regla                                                                                                                                                                                                                                                                                                                                                             |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Qué es un aporte        | **Manual** (fecha y monto) u, opcionalmente, **enlazado** a una transacción de ahorro o inversión. El enlazado **toma la transacción entera y la sigue**: si se corrige, cambia; si se borra, deja de contar. Una transacción aporta a una sola meta                                                                                                              |
| Moneda                  | **Una sola por meta**, elegida al crearla y **fija** después (2026-10-03): sus aportes van en ella y **nunca se convierte**. Si fue un error, se archiva y se crea otra. Una meta en dólares no acepta enlazar una transacción en soles, ni al revés                                                                                                              |
| Retiros                 | **Se permiten**, cuando se saca plata del ahorro: monto **positivo** con tipo `WITHDRAWAL`, que resta al avance. **Un retiro es siempre manual**: no se enlaza a una transacción. **No se saca más de lo que hay**: un retiro que dejaría lo ahorrado en negativo se rechaza                                                                                      |
| Aporte mensual sugerido | Faltante ÷ meses que quedan, **contando el mes en curso**, **redondeado hacia arriba al céntimo**: aportando lo sugerido nunca te quedas corto. En una meta que todavía no empieza, los meses se cuentan **desde el de inicio**. Cumplida: cero. Con la fecha fin pasada **no hay sugerido**                                                                      |
| Estados                 | **En curso**, **en riesgo**, **cumplida** y **vencida** (fecha fin pasada sin cumplir). En riesgo: el avance real está **más de 10 puntos** por debajo del esperado aportando parejo, **medido al cierre del mes anterior** (dentro del mes hay hasta fin de mes para aportar; en el primer mes no se espera nada). Una meta que todavía no empieza está en curso |
| Pasarse de la meta      | **Se permite.** Se muestra el porcentaje real (más de 100 %) y el excedente; la barra se llena al 100 % y la meta queda cumplida                                                                                                                                                                                                                                  |
| Fechas                  | **Libres** (una meta a 3 años vale), con el fin **después** del inicio. **El inicio puede ser pasado**, para registrar una meta que ya venías cumpliendo. Un aporte con fecha futura **se rechaza**, como una transacción; uno **anterior al inicio se acepta y cuenta**: es plata ya ahorrada                                                                    |
| Editar una meta         | Se pueden cambiar el objetivo y las fechas aunque tenga aportes: **todo se recalcula**, porque el progreso se calcula al consultar                                                                                                                                                                                                                                |
| Nombre                  | **Único por cuenta sin distinguir mayúsculas**, contando las archivadas, como el alias de un método de pago                                                                                                                                                                                                                                                       |
| Terminar una meta       | **Solo se archiva, a mano** (se conserva el historial y se puede desarchivar). Una meta cumplida **no** se archiva sola. No se borra. **Archivada no recibe aportes nuevos** (`GOAL_ARCHIVED`), pero se sigue corrigiendo y se le pueden deshacer aportes (2026-10-03)                                                                                            |
| Dónde se ve             | **«Metas»** (`/goals`) en el menú                                                                                                                                                                                                                                                                                                                                 |

### Cómo se calcula el progreso

`computeGoalProgress` en `@sol-a-sol/domain` (`packages/domain/src/goals/`), al consultar y con el «hoy» de Lima:

- **Ahorrado** = aportes − retiros con fecha de hoy o antes. Un aporte enlazado cuenta con el monto y la fecha de su transacción **hoy**, y solo si está vigente, es de ahorro o inversión y en la moneda de la meta (`linkedContributionState`). Solo puede quedar negativo si se borra una transacción enlazada, y entonces se muestra tal cual.
- **Falta** = objetivo − ahorrado, nunca negativo; **excedente** = lo que pasa del objetivo.
- **Porcentaje** = ahorrado / objetivo con `percentageOf`, sin redondear (2 decimales al mostrar); puede pasar de 100.
- **Esperado** = días transcurridos hasta el último día del mes anterior ÷ días de la meta (contando el de inicio y el de fin). Ejemplo: del 1 de enero al 10 de abril son 100 días; el 15 de marzo se espera el 59 % (al 28 de febrero). Con la fecha fin pasada, 100 %.
- **Atraso** (`behind`) = lo esperado (esperado × objetivo) − ahorrado, sin redondear; cero si se va al día. Es el «te faltan S/ … para ir al día» de la pantalla.
- **Estado:** cumplida si no falta nada (aunque haya vencido); si no, vencida si la fecha fin pasó; si no, en riesgo si esperado − porcentaje > 10; si no, en curso. Justo 10 puntos atrás sigue en curso.
- **Sugerido** = falta ÷ meses desde el mes en curso (o el de inicio) hasta el de fin, incluidos, redondeado hacia arriba al céntimo: S/ 1,000.00 entre octubre, noviembre y diciembre son S/ 333.34.

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

- **Emite:** nada. `GoalContributionAdded` (plan, sección 5.4) no se creó porque nadie lo escucharía, igual que `CreditCardThresholdExceeded` en H5: llega cuando lo necesite alguien (las notificaciones de H8).
- **Escucha:** nada. Los aportes enlazados se leen de su transacción al consultar, con `TransactionsLookup.liveTransactions` detrás del puerto `GoalTransactionsReader`: corregirla o borrarla no necesita avisar a nadie.

## API pública para otros módulos

`GoalsLookup` (exportado por `index.ts`): `goalsWithMovements(userId)` da todas las metas de la cuenta, archivadas incluidas, con su objetivo, sus fechas y los aportes y retiros que **cuentan** (los enlazados, con su transacción como está hoy). Quién se muestra y a qué fecha se mide lo decide quien lee: el **resumen mensual** de `reports` (H6), que calcula el progreso a su fecha de corte con `computeGoalProgress`. Exige el `userId`.

## Endpoints

Todos bajo `/api/v1`, solo desde una sesión (un token personal recibe 403) y con `@RequiresFeature('goals')`: **404** y fuera de OpenAPI con el flag apagado. Una meta ajena responde **404**, igual que una que no existe; un aporte de otra meta, también, aunque sea de la misma cuenta.

| Método   | Ruta                                         | Qué hace                                                                                                                             |
| -------- | -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `GET`    | `/goals`                                     | Las metas con su progreso, en el orden en que se crearon. Las archivadas, con `?includeArchived=true`                                |
| `POST`   | `/goals`                                     | Crea una meta (`name`, `currency`, `targetAmount`, `startDate`, `endDate`)                                                           |
| `PATCH`  | `/goals/{id}`                                | Corrige nombre, objetivo y fechas, o archiva (`archived`). La moneda no se cambia                                                    |
| `GET`    | `/goals/{id}/contributions`                  | Los aportes como están hoy: primero los más recientes; los enlazados a una transacción borrada, al final                             |
| `POST`   | `/goals/{id}/contributions`                  | Un aporte o retiro manual (`source: MANUAL`, `kind`, `amount`, `date`) o un aporte enlazado (`source: TRANSACTION`, `transactionId`) |
| `DELETE` | `/goals/{id}/contributions/{contributionId}` | Deshace un aporte o un retiro                                                                                                        |

El progreso viaja en cada meta (`saved`, `remaining`, `excess`, `percentage`, `expectedPercentage`, `suggestedMonthly`, `status`); los montos como string decimal en la moneda de la meta y los porcentajes sin redondear. Cada aporte trae su `state`: solo `ACTIVE` cuenta.

### Códigos de error

| Código                                  | Estado | Cuándo                                                                                 |
| --------------------------------------- | ------ | -------------------------------------------------------------------------------------- |
| `GOAL_NOT_FOUND`                        | 404    | La meta no existe o es de otra cuenta                                                  |
| `GOAL_CONTRIBUTION_NOT_FOUND`           | 404    | El aporte no existe o es de otra meta                                                  |
| `TRANSACTION_NOT_FOUND`                 | 404    | La transacción a enlazar no existe, está borrada o es de otra cuenta                   |
| `GOAL_NAME_TAKEN`                       | 409    | Otra meta de la cuenta, quizá archivada, ya tiene ese nombre sin distinguir mayúsculas |
| `GOAL_TRANSACTION_ALREADY_LINKED`       | 409    | La transacción ya aporta a una meta                                                    |
| `GOAL_TARGET_NOT_POSITIVE`              | 422    | Objetivo de cero o menos                                                               |
| `GOAL_END_NOT_AFTER_START`              | 422    | El fin no va después del inicio                                                        |
| `GOAL_ARCHIVED`                         | 422    | Aporte a una meta archivada                                                            |
| `GOAL_CONTRIBUTION_AMOUNT_NOT_POSITIVE` | 422    | Monto de cero o menos (el tipo dice si suma o resta)                                   |
| `GOAL_CONTRIBUTION_DATE_IN_FUTURE`      | 422    | Aporte con fecha posterior a hoy                                                       |
| `GOAL_WITHDRAWAL_EXCEEDS_SAVED`         | 422    | Un retiro, o deshacer un aporte, dejaría lo ahorrado en negativo                       |
| `GOAL_TRANSACTION_NOT_A_SAVING`         | 422    | La transacción a enlazar no es de ahorro ni de inversión                               |
| `GOAL_CURRENCY_MISMATCH`                | 422    | La transacción a enlazar está en otra moneda que la meta                               |
| `INVALID_AMOUNT`                        | 422    | Un monto con más de 2 decimales (no se redondea)                                       |

## Estado

- Feature flag: `FEATURE_GOALS` (**apagado** hasta cumplir la Definition of Done).
- Escenarios: [`features/goals/`](../../features/goals/), **en verde** con `pnpm test:bdd` (22). Corren contra los casos de uso reales con los fakes de los puertos, y los aportes enlazados leen su transacción con el `TransactionsLookup` real. Cada regla se comprobó rompiéndola (dominio, casos de uso y fakes); lo que vive en Prisma lo cubren `apps/api/test/goals/` y `apps/api/test/prisma/goals-tables.spec.ts`.
- Web: **«Metas» (`/goals`)**, en el menú cuando el flag está encendido (`requireFeature('FEATURE_GOALS')`). Cada meta dice en texto cuánto va (con el porcentaje en 2 decimales), cuánto falta, cómo va («Vas bien», «En riesgo: te faltan S/ … para ir al día», «¡Cumplida!», «Vencida: faltaron S/ …») y cuánto aportar al mes; la barra (`<progress>`) solo lo acompaña. Se crea y se corrige una meta, se aporta a mano o enlazando una transacción de ahorro, y quitar un aporte se deshace con «Deshacer», que lo vuelve a registrar. Las archivadas se ven con «Ver archivadas».
