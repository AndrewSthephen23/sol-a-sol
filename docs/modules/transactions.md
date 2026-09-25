# Módulo Transacciones (`transactions`)

> Ficha del módulo. Estado: **en construcción** (hito H3). Hoy se registra una transacción y se lee una por su id; la edición, el borrado y la restauración llegan en el siguiente PR de la tarea 05, y el listado con la 06. Flag **apagado**.

## Qué resuelve

Registrar cada movimiento de plata: ingresos, gastos, ahorro, inversión y pagos de deuda. Es el
núcleo del plan: el presupuesto (H4), las tarjetas (H5), los resúmenes (H6) y la captura desde el
celular (H7) calculan **sobre** las transacciones.

## Reglas de negocio

Decididas con el autor el 2026-09-24. No se cambian sin volver a preguntar. Viven en
`packages/domain/src/transactions/transaction-policy.ts`, con mutation testing al 100 %.

| Regla                        | Decisión                                                                                                                                                                                                                                      |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tipos                        | `INCOME`, `FIXED_EXPENSE`, `VARIABLE_EXPENSE`, `SAVING`, `INVESTMENT`, `DEBT` (glosario)                                                                                                                                                      |
| Monto                        | **Siempre positivo**: el signo lo da el tipo. Un cero o un negativo se rechaza (`TRANSACTION_AMOUNT_NOT_POSITIVE`). Hasta 2 decimales, como todo `Money`                                                                                      |
| Signo, para el saldo del mes | **Solo el ingreso suma.** Gastos, ahorro, inversión y deuda salen de lo disponible (`signedAmount`)                                                                                                                                           |
| Qué es **gasto**             | **Fijo + variable.** La deuda (pagar un préstamo o la tarjeta) se muestra aparte (`countsAsExpense`)                                                                                                                                          |
| Qué es **ahorro**            | **Ahorro + inversión**, para la tasa de ahorro = ahorro / ingresos: las dos son plata que no se consume (`countsAsSaving`)                                                                                                                    |
| Fecha                        | Fecha de negocio sin hora (`LocalDate`), **hasta hoy** en la hora de Lima. Una fecha futura se rechaza (`TRANSACTION_DATE_IN_FUTURE`): un pago programado se registra el día que ocurre, para que un resumen no muestre plata que no se movió |
| Moneda                       | La indicada o, si no, **la del método de pago**. Si ninguno la dice (tarjeta bimoneda, efectivo, sin método) **se exige** (`TRANSACTION_CURRENCY_REQUIRED`): el dominio no supone soles. **Nunca se convierte**                               |
| Categoría                    | **Del mismo tipo** que la transacción (`CATEGORY_TYPE_MISMATCH`) y **no archivada** para una transacción nueva (`CATEGORY_ARCHIVED`); una archivada sigue en las viejas                                                                       |
| Subcategoría                 | **Opcional.** Vale una categoría de primer nivel aunque tenga subcategorías («Comida» sin decir «Delivery»), o una subcategoría (2026-09-25)                                                                                                  |
| Método de pago               | **Opcional** (2026-09-25). Si se indica, tiene que ser propio y **no estar archivado** (`PAYMENT_METHOD_ARCHIVED`); uno archivado sigue en las transacciones viejas                                                                           |
| Descripción y comercio       | La descripción es **obligatoria** (hasta 200 caracteres); el comercio, opcional (hasta 80)                                                                                                                                                    |
| Origen (`source`)            | Lo pone la API, nunca quien llama: lo registrado desde la web es `MANUAL`. **No cambia al editar**                                                                                                                                            |
| Categoría y método ajenos    | Si no son del usuario, **404**, no 403: no se confirma que existen (tarea 05)                                                                                                                                                                 |
| Borrar                       | **Lógico** (`deletedAt`). Las consultas normales excluyen las borradas. Restaurar **no tiene plazo** en la API: el aviso de «Deshacer» de unos segundos es cosa de la interfaz (2026-09-25)                                                   |
| Editar                       | **Siempre**, también en meses pasados: no existe el mes cerrado, y los resúmenes se calculan al consultar (decisión 6 de H3). El tipo se puede cambiar, **junto con** una categoría de ese tipo (2026-09-25)                                  |

## Modelo de datos

`transactions(id, user_id, date, type, category_id, amount, currency, description, payment_method_id?, merchant?, source, capture_id?, created_at, updated_at, deleted_at?)`

- **`date` es `DATE`**, no `TIMESTAMPTZ`: es el día en que pasó. **`amount` es `NUMERIC(18,2)`**, con un `CHECK` de que sea positivo (`transactions_amount_positive`).
- **La base garantiza la categoría:** la clave foránea compuesta `(category_id, user_id, type)` → `categories(id, user_id, type)` hace imposible usar la categoría de otra persona o una de otro tipo, aunque alguien adivine su id. Lo mismo con el método de pago: `(payment_method_id, user_id)`.
- Una categoría o un método de pago **con transacciones no se puede borrar** (`NO ACTION`): se archiva.
- `source`: `MANUAL`, `IOS_SHORTCUT`, `ANDROID_AUTOMATION`, `IMPORT`.
- `capture_id` queda **sin clave foránea** hasta H7, cuando exista la tabla de capturas.
- Índice `(user_id, date)`, por el que se lista y se filtra siempre; y los de `category_id` y `payment_method_id`, para que comprobar si una categoría o un método tienen transacciones no recorra la tabla.
- **Lo que la base no puede exigir** queda para el dominio: que la fecha no sea futura (la base no sabe qué día es "hoy" para el usuario) y que la categoría no esté archivada.

## Eventos de dominio

Se publican **después de guardar**, esperando a los oyentes, y llevan solo ids (ADR-0004). Nadie los escucha todavía: existen para que el presupuesto (H4), las tarjetas (H5) y los resúmenes (H6) no tengan que tocar este módulo.

| Evento                             | Cuándo                      | Datos                       |
| ---------------------------------- | --------------------------- | --------------------------- |
| `transactions.transaction.created` | Se registró una transacción | `{ userId, transactionId }` |

Con la edición y el borrado llegan `…updated`, `…deleted` y `…restored`: restaurar también se anuncia, para que quien lleve una cuenta con los otros tres no se desincronice.

- **Escucha:** nada todavía.

## Dependencias

Comprueba la categoría y el método de pago con `CatalogLookup`, de la API pública de `catalog`, a través de su puerto `CatalogReader`. No lee las tablas del catálogo.

## Endpoints

Exigen una sesión (`Authorization: Bearer <token de acceso>`): un token personal recibe **403**, porque el celular registra por `/captures` (H7). Filtran por el `userId` del token y responden **404** con el flag apagado. Detalle en `/api/v1/openapi.json`.

| Método | Ruta                        | Qué hace                                                                  |
| ------ | --------------------------- | ------------------------------------------------------------------------- |
| `POST` | `/api/v1/transactions`      | Registra una transacción con `source: MANUAL`. **201** con la transacción |
| `GET`  | `/api/v1/transactions/{id}` | Devuelve una. **404** si no existe, es de otra cuenta o está borrada      |

El monto viaja como **string decimal** (`"25.90"`) y la fecha como `YYYY-MM-DD`. Un monto como número JSON se rechaza con `VALIDATION_FAILED`: ya perdió precisión antes de llegar.

### Errores

| `code`                            | Estado | Cuándo                                                        |
| --------------------------------- | ------ | ------------------------------------------------------------- |
| `INVALID_AMOUNT`                  | 422    | El monto tiene más de 2 decimales: se rechaza, no se redondea |
| `TRANSACTION_AMOUNT_NOT_POSITIVE` | 422    | Monto cero o negativo                                         |
| `TRANSACTION_DATE_IN_FUTURE`      | 422    | Fecha posterior a hoy en la hora de Lima                      |
| `TRANSACTION_CURRENCY_REQUIRED`   | 422    | Sin moneda, y el método no tiene una sola (o no hay método)   |
| `CATEGORY_TYPE_MISMATCH`          | 422    | La categoría es de otro tipo                                  |
| `CATEGORY_ARCHIVED`               | 422    | La categoría está archivada                                   |
| `PAYMENT_METHOD_ARCHIVED`         | 422    | El método de pago está archivado                              |
| `CATEGORY_NOT_FOUND`              | 404    | La categoría no existe o es de otra cuenta                    |
| `PAYMENT_METHOD_NOT_FOUND`        | 404    | El método de pago no existe o es de otra cuenta               |
| `TRANSACTION_NOT_FOUND`           | 404    | La transacción no existe, es de otra cuenta o está borrada    |

## Estado

- Feature flag: `FEATURE_TRANSACTIONS` (**apagado** hasta cumplir la Definition of Done)
- Escenarios: [`features/transactions/`](../../features/transactions/)
- Web: el manifest está en el registro de navegación pero no se ve con el flag apagado; la pantalla llega con la tarea 09.
