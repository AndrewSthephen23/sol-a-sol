# Módulo Transacciones (`transactions`)

> Ficha del módulo. Estado: **en construcción** (hito H3). Hoy se registra, se lista con filtros, se lee, se corrige, se borra (lógicamente) y se restaura una transacción. Flag **apagado**.

## Qué resuelve

Registrar cada movimiento de plata: ingresos, gastos, ahorro, inversión y pagos de deuda, y las transferencias entre las cuentas propias. Es el
núcleo del plan: el presupuesto (H4), las tarjetas (H5), los resúmenes (H6) y la captura desde el
celular (H7) calculan **sobre** las transacciones.

## Reglas de negocio

Decididas con el autor el 2026-09-24. No se cambian sin volver a preguntar. Viven en
`packages/domain/src/transactions/transaction-policy.ts`, con mutation testing al 100 %.

| Regla                        | Decisión                                                                                                                                                                                                                                                                                                                                   |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Tipos                        | `INCOME`, `FIXED_EXPENSE`, `VARIABLE_EXPENSE`, `SAVING`, `INVESTMENT`, `DEBT` (glosario)                                                                                                                                                                                                                                                   |
| Monto                        | **Siempre positivo**: el signo lo da el tipo. Un cero o un negativo se rechaza (`TRANSACTION_AMOUNT_NOT_POSITIVE`). Hasta 2 decimales, como todo `Money`                                                                                                                                                                                   |
| Signo, para el saldo del mes | **Solo el ingreso suma.** Gastos, ahorro, inversión y deuda salen de lo disponible (`signedAmount`)                                                                                                                                                                                                                                        |
| Qué es **gasto**             | **Fijo + variable.** La deuda (préstamos, intereses y comisiones) se muestra aparte (`countsAsExpense`)                                                                                                                                                                                                                                    |
| Qué es **ahorro**            | **Ahorro + inversión**, para la tasa de ahorro = ahorro / ingresos: las dos son plata que no se consume (`countsAsSaving`)                                                                                                                                                                                                                 |
| Fecha                        | Fecha de negocio sin hora (`LocalDate`), **hasta hoy** en la hora de Lima. Una fecha futura se rechaza (`TRANSACTION_DATE_IN_FUTURE`): un pago programado se registra el día que ocurre, para que un resumen no muestre plata que no se movió                                                                                              |
| Moneda                       | La indicada o, si no, **la del método de pago**. Si ninguno la dice (tarjeta bimoneda, efectivo, sin método) **se exige** (`TRANSACTION_CURRENCY_REQUIRED`): el dominio no supone soles. **Nunca se convierte**                                                                                                                            |
| Categoría                    | **Del mismo tipo** que la transacción (`CATEGORY_TYPE_MISMATCH`) y **no archivada** para una transacción nueva (`CATEGORY_ARCHIVED`); una archivada sigue en las viejas                                                                                                                                                                    |
| Subcategoría                 | **Opcional.** Vale una categoría de primer nivel aunque tenga subcategorías («Comida» sin decir «Delivery»), o una subcategoría (2026-09-25)                                                                                                                                                                                               |
| Método de pago               | **Opcional** (2026-09-25). Si se indica, tiene que ser propio y **no estar archivado** (`PAYMENT_METHOD_ARCHIVED`); uno archivado sigue en las transacciones viejas                                                                                                                                                                        |
| Descripción y comercio       | La descripción es **obligatoria** (hasta 200 caracteres); el comercio, opcional (hasta 80)                                                                                                                                                                                                                                                 |
| Origen (`source`)            | Lo pone la API, nunca quien llama: lo registrado desde la web es `MANUAL`. **No cambia al editar**                                                                                                                                                                                                                                         |
| Categoría y método ajenos    | Si no son del usuario, **404**, no 403: no se confirma que existen (tarea 05)                                                                                                                                                                                                                                                              |
| Borrar                       | **Lógico** (`deletedAt`). Las consultas normales excluyen las borradas. Restaurar **no tiene plazo** en la API: el aviso de «Deshacer» de unos segundos es cosa de la interfaz (2026-09-25)                                                                                                                                                |
| Editar                       | **Siempre**, también en meses pasados: no existe el mes cerrado, y los resúmenes se calculan al consultar (decisión 6 de H3). El tipo se puede cambiar, **junto con** una categoría de ese tipo (2026-09-25)                                                                                                                               |
| Listado                      | **Transacciones y transferencias mezcladas**, cada fila con `kind`. De la fecha más reciente a la más antigua y, en el mismo día, del id más nuevo al más viejo (UUIDv7 ordena por creación). **Sin fechas trae todo** (2026-09-25): la web manda el mes que muestra. Las borradas no aparecen; las de categorías o métodos archivados, sí |
| Filtros                      | `month` o `from`/`to` (inclusivos), `type`, `categoryId` (**con sus subcategorías**), `paymentMethodId`, `currency` y `q`. Una categoría ajena no trae nada, sin decir si existe                                                                                                                                                           |
| Búsqueda (`q`)               | Dentro de la descripción o el comercio, **sin distinguir mayúsculas ni tildes**. La ñ es otra letra: «ano» no encuentra «año». `%` y `_` se buscan como letras, no son comodines                                                                                                                                                           |
| Paginación                   | Por **cursor opaco** (`nextCursor`), nunca por número de página: lo que se registre o se borre entre dos páginas no hace repetir ni saltar filas. `limit` por defecto 50; más de 100 se recorta a 100                                                                                                                                      |
| Qué es **deuda**             | Pagar un **préstamo** (a un banco o a una persona) y lo que cuesta deber: **intereses, comisiones, membresía, desgravamen**. **Pagar la tarjeta de crédito no es deuda**: es una transferencia de la cuenta a la tarjeta, porque el gasto ya se contó al comprar (2026-09-27)                                                              |
| Totales del listado          | **En la misma respuesta**, de todas las **transacciones** filtradas (no solo de la página; las transferencias no cuentan), **por moneda** y sin convertir: ingresos, gasto (fijo + variable), ahorro (ahorro + inversión), deuda y saldo (2026-09-25). Viven en `totalsByCurrency` (dominio)                                               |
| Reglas al editar             | Se juzga la transacción **como quedaría**. Una fecha nueva no puede ser futura. Una categoría o un método archivados que ya tenía **siguen valiendo**; elegirlos ahora, no. Sin `currency`, la moneda **no cambia**, aunque cambie el método de pago                                                                                       |

## Modelo de datos

`transactions(id, user_id, date, type, category_id, amount, currency, description, payment_method_id?, merchant?, source, capture_id?, created_at, updated_at, deleted_at?)`

- **`date` es `DATE`**, no `TIMESTAMPTZ`: es el día en que pasó. **`amount` es `NUMERIC(18,2)`**, con un `CHECK` de que sea positivo (`transactions_amount_positive`).
- **La base garantiza la categoría:** la clave foránea compuesta `(category_id, user_id, type)` → `categories(id, user_id, type)` hace imposible usar la categoría de otra persona o una de otro tipo, aunque alguien adivine su id. Lo mismo con el método de pago: `(payment_method_id, user_id)`.
- Una categoría o un método de pago **con transacciones no se puede borrar** (`NO ACTION`): se archiva.
- `source`: `MANUAL`, `IOS_SHORTCUT`, `ANDROID_AUTOMATION`, `IMPORT`.
- `capture_id` queda **sin clave foránea** hasta H7, cuando exista la tabla de capturas.
- Índice `(user_id, date)`, por el que se lista y se filtra siempre; y los de `category_id` y `payment_method_id`, para que comprobar si una categoría o un método tienen transacciones no recorra la tabla.
- **El listado va en SQL parametrizado** (`Prisma.sql`), no con `findMany`: la búsqueda sin tildes necesita `lower(translate(…))`, que Prisma no expresa. La tabla de acentos es **una sola**, `ACCENT_FOLD_FROM`/`ACCENT_FOLD_TO` del dominio, que usan tanto `searchKey` como la consulta.
- **Lo que la base no puede exigir** queda para el dominio: que la fecha no sea futura (la base no sabe qué día es "hoy" para el usuario) y que la categoría no esté archivada.

## Transferencias entre cuentas propias

Plata que **cambia de lugar** sin ser ingreso ni gasto: del banco a Yape, de soles a dólares, de la cuenta a la tarjeta. Decidido con el autor el 2026-09-27; viven en `packages/domain/src/transactions/transfer-policy.ts`, con mutation testing al 100 %.

| Regla              | Decisión                                                                                                                                                                                                                                                                                                                                                                                        |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Qué es             | Una **entidad propia** (`transfers`), no un tipo de transacción: tiene cuenta de origen y de destino, y no tiene categoría                                                                                                                                                                                                                                                                      |
| Totales            | **No cuenta** en ingresos, gastos, ahorro, deuda ni tasa de ahorro                                                                                                                                                                                                                                                                                                                              |
| En el listado      | **Mezcladas con las transacciones** en `GET /transactions`, por fecha, cada fila con `kind` (`transaction` o `transfer`); `?kind=` deja solo unas u otras. Filtrar por `type` o `categoryId` las deja fuera; por `paymentMethodId` trae las que salen **o** llegan a esa cuenta, y por `currency`, las que mueven esa moneda al salir **o** al llegar. `q` busca en su descripción (2026-09-28) |
| Cuentas            | Dos métodos de pago **propios, distintos** (`TRANSFER_SAME_ACCOUNT`) y **activos** (`PAYMENT_METHOD_ARCHIVED`)                                                                                                                                                                                                                                                                                  |
| Moneda             | **La ponen las cuentas:** una en soles solo manda o recibe soles (`TRANSFER_CURRENCY_MISMATCH`). Una que acepta las dos (efectivo, tarjeta bimoneda) toma la indicada; si no hay ninguna, se exige la de salida, y la de llegada es la misma                                                                                                                                                    |
| Misma moneda       | Llega lo mismo que salió; un monto recibido distinto se rechaza (`TRANSFER_RECEIVED_AMOUNT_MISMATCH`)                                                                                                                                                                                                                                                                                           |
| Cambio de moneda   | **Dos montos**, lo que sale y lo que llega, **copiados del voucher**; el recibido es obligatorio (`TRANSFER_RECEIVED_AMOUNT_REQUIRED`). **Nunca se convierte**. El tipo de cambio se deriva de los dos montos, no se guarda                                                                                                                                                                     |
| Montos y fecha     | Positivos (`TRANSFER_AMOUNT_NOT_POSITIVE`), hasta 2 decimales, y fecha hasta hoy en Lima, como en las transacciones                                                                                                                                                                                                                                                                             |
| Tarjeta de crédito | Comprar con la tarjeta es un **gasto**; **pagarla** es una transferencia cuenta → tarjeta. En H5, lo que se debe = compras − transferencias a la tarjeta                                                                                                                                                                                                                                        |
| Corregir           | Como las transacciones: se juzga **como quedaría**; una cuenta archivada que ya tenía sigue valiendo. En un cambio de moneda, **corregir el monto enviado exige mandar también el recibido**: cambiar uno solo movería el tipo de cambio sin que nadie lo diga (2026-09-28). Si el destino pasa a ser de la moneda de origen, llega lo mismo que salió                                          |
| Borrar             | Lógico, y se restaura **sin plazo**, como las transacciones                                                                                                                                                                                                                                                                                                                                     |

**Tabla** `transfers(id, user_id, date, from_payment_method_id, to_payment_method_id, amount, currency, received_amount, received_currency, description, source, created_at, updated_at, deleted_at?)`. Las dos cuentas van con claves foráneas compuestas `(método, user_id)`, como en las transacciones. La base repite las reglas como red: montos positivos, cuentas distintas y, en la misma moneda, el mismo monto.

**Después de H3:** el saldo por cuenta (saldo inicial + transacciones + transferencias), para auditar contra la app del banco.

## Eventos de dominio

Se publican **después de guardar**, esperando a los oyentes, y llevan solo ids (ADR-0004). Nadie los escucha todavía: existen para que el presupuesto (H4), las tarjetas (H5) y los resúmenes (H6) no tengan que tocar este módulo.

| Evento                              | Cuándo                                 | Datos                       |
| ----------------------------------- | -------------------------------------- | --------------------------- |
| `transactions.transaction.created`  | Se registró una transacción            | `{ userId, transactionId }` |
| `transactions.transaction.updated`  | Se corrigió                            | `{ userId, transactionId }` |
| `transactions.transaction.deleted`  | Se borró (lógicamente): deja de contar | `{ userId, transactionId }` |
| `transactions.transaction.restored` | Se deshizo el borrado: vuelve a contar | `{ userId, transactionId }` |
| `transactions.transfer.created`     | Se registró una transferencia          | `{ userId, transferId }`    |
| `transactions.transfer.updated`     | Se corrigió una transferencia          | `{ userId, transferId }`    |
| `transactions.transfer.deleted`     | Se borró (lógicamente)                 | `{ userId, transferId }`    |
| `transactions.transfer.restored`    | Se deshizo el borrado                  | `{ userId, transferId }`    |

Restaurar también se anuncia, para que quien lleve una cuenta con los otros tres no se desincronice. Borrar una ya borrada responde 404 y restaurar una vigente no hace nada: ninguno anuncia dos veces.

- **Escucha:** nada todavía.

## Dependencias

Comprueba la categoría y el método de pago, y obtiene las subcategorías para filtrar, con `CatalogLookup`, de la API pública de `catalog`, a través de su puerto `CatalogReader`. No lee las tablas del catálogo.

## Endpoints

Exigen una sesión (`Authorization: Bearer <token de acceso>`): un token personal recibe **403**, porque el celular registra por `/captures` (H7). Filtran por el `userId` del token y responden **404** con el flag apagado. Detalle en `/api/v1/openapi.json`.

| Método   | Ruta                                | Qué hace                                                                                                                                       |
| -------- | ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET`    | `/api/v1/transactions`              | Lista transacciones y transferencias con filtros, búsqueda, cursor y totales por moneda: `{ items, nextCursor, totals }`, cada fila con `kind` |
| `POST`   | `/api/v1/transactions`              | Registra una transacción con `source: MANUAL`. **201** con la transacción                                                                      |
| `GET`    | `/api/v1/transactions/{id}`         | Devuelve una. **404** si no existe, es de otra cuenta o está borrada                                                                           |
| `PATCH`  | `/api/v1/transactions/{id}`         | Corrige lo que se mande, menos el origen. **404** si no existe, es ajena o está borrada                                                        |
| `DELETE` | `/api/v1/transactions/{id}`         | Borrado lógico. **204**; **404** si no existe, es ajena o ya estaba borrada                                                                    |
| `POST`   | `/api/v1/transactions/{id}/restore` | Deshace el borrado, sin plazo. **200** con la transacción; con una vigente, la devuelve igual                                                  |
| `POST`   | `/api/v1/transfers`                 | Registra una transferencia entre cuentas propias con `source: MANUAL`. **201**                                                                 |
| `GET`    | `/api/v1/transfers/{id}`            | Devuelve una. **404** si no existe, es de otra cuenta o está borrada                                                                           |
| `PATCH`  | `/api/v1/transfers/{id}`            | Corrige lo que se mande, menos el origen. **404** si no existe, es ajena o está borrada                                                        |
| `DELETE` | `/api/v1/transfers/{id}`            | Borrado lógico. **204**; **404** si no existe, es ajena o ya estaba borrada                                                                    |
| `POST`   | `/api/v1/transfers/{id}/restore`    | Deshace el borrado, sin plazo. **200** con la transferencia                                                                                    |

El monto viaja como **string decimal** (`"25.90"`) y la fecha como `YYYY-MM-DD`. Un monto como número JSON se rechaza con `VALIDATION_FAILED`: ya perdió precisión antes de llegar.

### Errores

| `code`                              | Estado | Cuándo                                                              |
| ----------------------------------- | ------ | ------------------------------------------------------------------- |
| `INVALID_AMOUNT`                    | 422    | El monto tiene más de 2 decimales: se rechaza, no se redondea       |
| `TRANSACTION_AMOUNT_NOT_POSITIVE`   | 422    | Monto cero o negativo                                               |
| `TRANSACTION_DATE_IN_FUTURE`        | 422    | Fecha posterior a hoy en la hora de Lima                            |
| `TRANSACTION_CURRENCY_REQUIRED`     | 422    | Sin moneda, y el método no tiene una sola (o no hay método)         |
| `CATEGORY_TYPE_MISMATCH`            | 422    | La categoría es de otro tipo                                        |
| `CATEGORY_ARCHIVED`                 | 422    | La categoría está archivada                                         |
| `PAYMENT_METHOD_ARCHIVED`           | 422    | El método de pago está archivado                                    |
| `CATEGORY_NOT_FOUND`                | 404    | La categoría no existe o es de otra cuenta                          |
| `PAYMENT_METHOD_NOT_FOUND`          | 404    | El método de pago no existe o es de otra cuenta                     |
| `TRANSACTION_NOT_FOUND`             | 404    | La transacción no existe, es de otra cuenta o está borrada          |
| `INVALID_CURSOR`                    | 422    | El cursor no es uno que haya dado la API: se pide la primera página |
| `TRANSFER_SAME_ACCOUNT`             | 422    | Origen y destino son la misma cuenta                                |
| `TRANSFER_CURRENCY_MISMATCH`        | 422    | Una moneda que la cuenta no maneja                                  |
| `TRANSFER_RECEIVED_AMOUNT_REQUIRED` | 422    | Cambio de moneda sin el monto recibido                              |
| `TRANSFER_RECEIVED_AMOUNT_MISMATCH` | 422    | En la misma moneda, un monto recibido distinto del enviado          |
| `TRANSFER_AMOUNT_NOT_POSITIVE`      | 422    | Un monto de transferencia cero o negativo                           |
| `TRANSFER_NOT_FOUND`                | 404    | La transferencia no existe, es de otra cuenta o está borrada        |

## Estado

- Feature flag: `FEATURE_TRANSACTIONS` (**apagado** hasta cumplir la Definition of Done)
- Escenarios: [`features/transactions/`](../../features/transactions/)
- Web: el manifest está en el registro de navegación pero no se ve con el flag apagado; la pantalla llega con la tarea 09.
